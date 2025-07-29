import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap, timer, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, map as rxMap } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { DataApiService } from './data-api.service';


@Injectable({ providedIn: 'root' })
export class PatientService {
  // State management for background processing
  private _isSyncing = new BehaviorSubject<boolean>(false);
  private _isDone = new BehaviorSubject<boolean>(false);
  private _showExportNotif = new BehaviorSubject<boolean>(false);
  private _lastExportDate = new BehaviorSubject<string | null>(localStorage.getItem('lastExportDate'));

  // Public observables
  public isSyncing$ = this._isSyncing.asObservable();
  public isDone$ = this._isDone.asObservable();
  public showExportNotif$ = this._showExportNotif.asObservable();
  public lastExportDate$ = this._lastExportDate.asObservable();

  // Getters for current values
  get isSyncing(): boolean { return this._isSyncing.value; }
  get isDone(): boolean { return this._isDone.value; }
  get showExportNotif(): boolean { return this._showExportNotif.value; }
  get lastExportDate(): string | null { return this._lastExportDate.value; }

  constructor(protected dataApiService: DataApiService,private http: HttpClient, private toastr: ToastrService) {}

  // Public methods for component interaction
  showNotification(): void {
    this._showExportNotif.next(true);
    setTimeout(() => { this._showExportNotif.next(false); }, 3000);
  }

  updateLastExportDate(): void {
    const exportDate = new Date().toLocaleString();
    this._lastExportDate.next(exportDate);
    localStorage.setItem('lastExportDate', exportDate);
  }

  getPatients(count: number = 100): Observable<any[]> {
    return this.http.get<any>(`${this.dataApiService.serverURL}/api/patients`, { params: { count: count.toString() } }).pipe(
      map(bundle => bundle.entry ? bundle.entry.map((e: any) => e.resource) : [])
    );
  }

  startExportJob(): Observable<string> {
    const headers = new HttpHeaders({
      'Accept': 'application/fhir+json',
      'Prefer': 'respond-async'
    });
    return this.http.get<any>(`${this.dataApiService.serverURL}/api/patient-export`, { headers, observe: 'response' }).pipe(
      map(res => {
        const jobId = res.body?.jobId;
        if (!jobId) throw new Error('No jobId returned from backend.');
        return jobId;
      })
    );
  }

  pollExportStatus(jobId: string): Observable<any> {
    return timer(0, 10000).pipe(
      switchMap(() => this.http.get(`${this.dataApiService.serverURL}/api/patient-export/status`, { params: { jobId }, observe: 'response' })),
      map(res => {
        if (res.status === 202) {
          // Still processing, keep polling
          return null;
        } else if (res.status === 200) {
          // Done!
          return res.body;
        } else {
          throw new Error('Export failed or returned unexpected status: ' + res.status);
        }
      }),
      filter(result => result !== null), // Only emit when done
      take(1), // Complete after first 200 response
      catchError(err => throwError(() => err))
    );
  }

  fetchAndDecodeBinary(binaryId: string): Observable<any[]> {
    return this.http.get<any>(`${this.dataApiService.serverURL}/api/binary/${binaryId}`).pipe(
      rxMap(binaryResource => {
        const base64_data = binaryResource?.data;
        if (!base64_data) {
          console.warn(`No 'data' field found in Binary/${binaryId}`);
          return [];
        }
        try {
          const decoded = atob(base64_data);
          const lines = decoded.trim().split(/\r?\n/);
          const records = lines.map(line => JSON.parse(line));
          return records;
        } catch (e) {
          throw new Error('Failed to decode or parse Binary: ' + binaryId);
        }
      })
    );
  }


  getAllergiesByPatient(patientId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.dataApiService.serverURL}/api/allergies/${patientId}`);
  }

  getAllergiesExport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.dataApiService.serverURL}/api/allergies`);
  }

  getImmunizationAndConditionsByPatient(patientId: string): Observable<any> {
    return this.http.get<any>(`${this.dataApiService.serverURL}/api/bulk-export/patient/${patientId}`);
  }

  // Background processing method that persists across component destruction
  startBackgroundImmunizationExport(): void {
    if (this.isSyncing) return;
    this._isDone.next(false);
    this._isSyncing.next(true);
    this.startExportJob().subscribe({
      next: (jobId) => {
        this.pollExportStatus(jobId).subscribe({
          next: (result) => {
            this._isSyncing.next(false);
            this._isDone.next(true);
            this._showExportNotif.next(true);
            setTimeout(() => { this._showExportNotif.next(false); }, 3000);
            const exportDate = new Date().toLocaleString();
            this._lastExportDate.next(exportDate);
            localStorage.setItem('lastExportDate', exportDate);
            // Extract and cache Immunization/Condition Binary IDs
            const output = Array.isArray(result?.output) ? result.output : [];
            const ids: { Immunization: string[]; Condition: string[] } = { Immunization: [], Condition: [] };
            for (const entry of output) {
              if ((entry.type === 'Immunization' || entry.type === 'Condition') && entry.url) {
                const match = entry.url.match(/\/Binary\/([^/]+)/);
                if (match) {
                  ids[entry.type as 'Immunization' | 'Condition'].push(match[1]);
                }
              }
            }
            localStorage.setItem('immunization_condition_binary_ids', JSON.stringify(ids));
            this.processAndCachePatientData(ids.Immunization, ids.Condition);
            setTimeout(() => { this._isDone.next(false); }, 2500);
          },
          error: (err) => {
            this._isSyncing.next(false);
            this._isDone.next(false);
            this.toastr.error('Export failed: ' + (err?.message || err));
          }
        });
      },
      error: (err) => {
        this._isSyncing.next(false);
        this._isDone.next(false);
        this.toastr.error('Export failed: ' + (err?.message || err));
      }
    });
  }

  private processAndCachePatientData(immunizationIds: string[], conditionIds: string[]): void {
    const groupedRaw = localStorage.getItem('grouped_patient_data');
    let grouped: { [patientId: string]: { patient_id: string, conditions: any[], immunizations: any[], allergies?: any[] } } = {};
    if (groupedRaw) {
      try {
        grouped = JSON.parse(groupedRaw);
      } catch {}
    }
    let totalToFetch = immunizationIds.length + conditionIds.length;
    let fetched = 0;
    const finish = () => {
      if (++fetched === totalToFetch) {
        localStorage.setItem('grouped_patient_data', JSON.stringify(grouped));
      }
    };
    // Process Immunizations
    for (const id of immunizationIds) {
      this.fetchAndDecodeBinary(id).subscribe({
        next: (records) => {
          for (const rec of records) {
            const ref = rec.patient?.reference || '';
            const patientId = ref.replace('Patient/', '');
            if (!grouped[patientId]) {
              grouped[patientId] = { 
                patient_id: patientId, 
                conditions: [], 
                immunizations: [], 
                allergies: [] 
              };
            }
            if (grouped[patientId].allergies === undefined) {
              grouped[patientId].allergies = [];
            }
            grouped[patientId].immunizations.push(rec);
          }
          finish();
        },
        error: (err) => {
          console.error('Failed to fetch immunization binary:', id, err);
          finish();
        }
      });
    }
    // Process Conditions
    for (const id of conditionIds) {
      this.fetchAndDecodeBinary(id).subscribe({
        next: (records) => {
          for (const rec of records) {
            const ref = rec.subject?.reference || '';
            const patientId = ref.replace('Patient/', '');
            if (!grouped[patientId]) {
              grouped[patientId] = { 
                patient_id: patientId, 
                conditions: [], 
                immunizations: [], 
                allergies: [] 
              };
            }
            if (grouped[patientId].allergies === undefined) {
              grouped[patientId].allergies = [];
            }
            grouped[patientId].conditions.push(rec);
          }
          finish();
        },
        error: (err) => {
          console.error('Failed to fetch condition binary:', id, err);
          finish();
        }
      });
    }
  }
} 