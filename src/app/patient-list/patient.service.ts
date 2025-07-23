import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap, timer, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, map as rxMap } from 'rxjs/operators';

const typesToExport = ["Immunization","Condition"]

@Injectable({ providedIn: 'root' })
export class PatientService {
  private fhirBaseUrl = (window as any)["IMMUNIZATION_DEFAULT_FHIR_URL"] || '';
  private apiUrl = this.fhirBaseUrl + '/Patient?_count=100';
  private exportUrl = this.fhirBaseUrl + '/Patient/$export';

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

  constructor(private http: HttpClient) {
    console.log('IMMUNIZATION_DEFAULT_FHIR_URL:', (window as any)["IMMUNIZATION_DEFAULT_FHIR_URL"]);
    console.log('fhirBaseUrl:', this.fhirBaseUrl);
    console.log('apiUrl:', this.apiUrl);
    console.log('exportUrl:', this.exportUrl);
  }

  getPatients(): Observable<any[]> {
    return this.http.get<any>(this.apiUrl).pipe(
      map(bundle => bundle.entry ? bundle.entry.map((e: any) => e.resource) : [])
    );
  }

  startExportJob(): Observable<string> {
    const headers = new HttpHeaders({
      'Accept': 'application/fhir+json',
      'Prefer': 'respond-async'
    });
    const typeParam = typesToExport.length > 0 ? `?_type=${typesToExport.join(',')}` : '';
    const url = this.exportUrl + typeParam;
    const startTime = Date.now();
    return this.http.get(url, { headers, observe: 'response' }).pipe(
      map(res => {
        const endTime = Date.now();
        const pollUrl = res.headers.get('Content-Location');
        if (!pollUrl) throw new Error('No Content-Location returned.');
        return pollUrl;
      })
    );
  }

  pollExportStatus(pollUrl: string): Observable<any> {
    return timer(0, 10000).pipe(
      switchMap(() => this.http.get(pollUrl, { observe: 'response' })),
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
    const url = `${this.fhirBaseUrl}/Binary/${binaryId}`;
    const headers = new HttpHeaders({ 'Accept': 'application/fhir+json' });
    return this.http.get<any>(url, { headers }).pipe(
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

  // Background processing method that persists across component destruction
  startBackgroundImmunizationExport(): void {
    if (this.isSyncing) return;
    
    this._isDone.next(false);
    this._isSyncing.next(true);
    
    this.startExportJob().subscribe({
      next: (pollUrl) => {
        this.pollExportStatus(pollUrl).subscribe({
          next: (result) => {
            this._isSyncing.next(false);
            this._isDone.next(true);
            this._showExportNotif.next(true);
            
            // Hide notification after 3 seconds
            setTimeout(() => { 
              this._showExportNotif.next(false); 
            }, 3000);
            
            // Update last export date
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
            
            // Cache the binary IDs
            localStorage.setItem('immunization_condition_binary_ids', JSON.stringify(ids));
            
            // Process the data in background
            this.processAndCachePatientData(ids.Immunization, ids.Condition);
            
            // Reset done state after 2.5 seconds
            setTimeout(() => { 
              this._isDone.next(false); 
            }, 2500);
          },
          error: (err) => {
            this._isSyncing.next(false);
            this._isDone.next(false);
            console.error('Export failed:', err);
            alert('Export failed: ' + (err?.message || err));
          }
        });
      },
      error: (err) => {
        this._isSyncing.next(false);
        this._isDone.next(false);
        console.error('Export failed:', err);
        alert('Export failed: ' + (err?.message || err));
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