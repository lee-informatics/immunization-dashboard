import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap, timer, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, map as rxMap } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { DataApiService } from './data-api.service';

interface ImportJob {
  importJobId: string;
  exportJobId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  finishedAt?: string;
  error?: string;
  result?: any;
}

@Injectable({ providedIn: 'root' })
export class PatientService {
  // State management for background processing
  private _isSyncing = new BehaviorSubject<boolean>(false);
  private _isDone = new BehaviorSubject<boolean>(false);
  private _showExportNotif = new BehaviorSubject<boolean>(false);
  private _lastExportDate = new BehaviorSubject<string | null>(localStorage.getItem('lastExportDate'));
  
  // Import state management
  private _isImporting = new BehaviorSubject<boolean>(false);
  private _importStatus = new BehaviorSubject<string>('IDLE'); // 'IDLE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  private _showImportNotif = new BehaviorSubject<boolean>(false);
  private _lastImportDate = new BehaviorSubject<string | null>(localStorage.getItem('lastImportDate'));
  
  private SERVER_URL = (window as any)["IMMUNIZATION_SERVER_URL"] || '';

  // Public observables
  public isSyncing$ = this._isSyncing.asObservable();
  public isDone$ = this._isDone.asObservable();
  public showExportNotif$ = this._showExportNotif.asObservable();
  public lastExportDate$ = this._lastExportDate.asObservable();
  
  // Import observables
  public isImporting$ = this._isImporting.asObservable();
  public importStatus$ = this._importStatus.asObservable();
  public showImportNotif$ = this._showImportNotif.asObservable();
  public lastImportDate$ = this._lastImportDate.asObservable();

  // Getters for current values
  get isSyncing(): boolean { return this._isSyncing.value; }
  get showExportNotif(): boolean { return this._showExportNotif.value; }
  get isImporting(): boolean { return this._isImporting.value; }
  get importStatus(): string { return this._importStatus.value; }

  constructor(protected dataApiService: DataApiService,private http: HttpClient, private toastr: ToastrService) {}

  // Public methods for component interaction
  showNotification(): void {
    this._showExportNotif.next(true);
    setTimeout(() => { this._showExportNotif.next(false); }, 3000);
  }

  showImportNotification(): void {
    this._showImportNotif.next(true);
    setTimeout(() => { this._showImportNotif.next(false); }, 3000);
  }

  updateLastExportDate(): void {
    const exportDate = new Date().toLocaleString();
    this._lastExportDate.next(exportDate);
    localStorage.setItem('lastExportDate', exportDate);
  }

  updateLastImportDate(): void {
    const importDate = new Date().toLocaleString();
    this._lastImportDate.next(importDate);
    localStorage.setItem('lastImportDate', importDate);
  }

  getPatients(count: number = 100): Observable<any[]> {
    return this.http.get<any>(`${this.SERVER_URL}/api/patients`, { params: { count: count.toString() } }).pipe(
      map(bundle => bundle.entry ? bundle.entry.map((e: any) => e.resource) : []),
      catchError(err => {
        console.error('[PatientService] Error fetching patients:', err);
        const errorMessage = err.error?.error || err.error?.details || err.message || 'Failed to fetch patients';
        this.toastr.error(errorMessage, 'Connection Error');
        throw err;
      })
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
      }),
      catchError(err => {
        console.error('[PatientService] Error starting export job:', err);
        const errorMessage = err.error?.error || err.error?.details || err.message || 'Failed to start export job';
        this.toastr.error(errorMessage, 'Export Error');
        throw err;
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
      catchError(err => {
        console.error('[PatientService] Error polling export status:', err);
        const errorMessage = err.error?.error || err.error?.details || err.message || 'Failed to check export status';
        this.toastr.error(errorMessage, 'Export Error');
        throw err;
      })
    );
  }

  pollImportStatus(): Observable<ImportJob> {
    return timer(0, 5000).pipe(
      switchMap(() => this.http.get(`${this.SERVER_URL}/api/bulk-export/import/status/latest`, { observe: 'response' })),
      map(res => {
        if (res.status === 200) {
          const importJob = res.body as ImportJob;
          if (!importJob) {
            // No import job found
            return null;
          }
          if (importJob.status === 'IN_PROGRESS') {
            // Still importing, keep polling
            return null;
          } else if (importJob.status === 'COMPLETED') {
            // Import completed!
            return importJob;
          } else if (importJob.status === 'FAILED') {
            // Import failed
            throw new Error('Import failed: ' + (importJob.error || 'Unknown error'));
          } else {
            // No import job found or other status
            return null;
          }
        } else {
          throw new Error('Failed to get import status: ' + res.status);
        }
      }),
      filter((result): result is ImportJob => result !== null), // Only emit when done
      take(1), // Complete after first successful response
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
    console.log('[DEBUG] PatientService.getAllergiesByPatient called with patientId:', patientId);
    console.log('[DEBUG] SERVER_URL:', this.SERVER_URL);
    const url = `${this.SERVER_URL}/api/allergies/${patientId}`;
    console.log('[DEBUG] Making HTTP request to:', url);
    return this.http.get<any[]>(url).pipe(
      catchError(err => {
        console.error('[PatientService] Error fetching allergies:', err);
        const errorMessage = err.error?.error || err.error?.details || err.message || 'Failed to fetch allergies';
        this.toastr.error(errorMessage, 'Allergies Error');
        throw err;
      })
    );
  }

  getConditionsByPatient(patientId: string): Observable<any[]> {
    console.log('[DEBUG] PatientService.getConditionsByPatient called with patientId:', patientId);
    const url = `${this.SERVER_URL}/api/conditions/${patientId}`;
    console.log('[DEBUG] Making HTTP request to:', url);
    return this.http.get<any[]>(url).pipe(
      catchError(err => {
        console.error('[PatientService] Error fetching conditions:', err);
        const errorMessage = err.error?.error || err.error?.details || err.message || 'Failed to fetch conditions';
        this.toastr.error(errorMessage, 'Conditions Error');
        throw err;
      })
    );
  }

  getImmunizationsByPatient(patientId: string): Observable<any[]> {
    console.log('[DEBUG] PatientService.getImmunizationsByPatient called with patientId:', patientId);
    const url = `${this.SERVER_URL}/api/immunizations/${patientId}`;
    console.log('[DEBUG] Making HTTP request to:', url);
    return this.http.get<any[]>(url).pipe(
      catchError(err => {
        console.error('[PatientService] Error fetching immunizations:', err);
        const errorMessage = err.error?.error || err.error?.details || err.message || 'Failed to fetch immunizations';
        this.toastr.error(errorMessage, 'Immunizations Error');
        throw err;
      })
    );
  }

  getAllConditions(): Observable<any[]> {
    return this.http.get<any[]>(`${this.SERVER_URL}/api/conditions`).pipe(
      catchError(err => {
        console.error('[PatientService] Error fetching all conditions:', err);
        const errorMessage = err.error?.error || err.error?.details || err.message || 'Failed to fetch conditions';
        this.toastr.error(errorMessage, 'Conditions Error');
        throw err;
      })
    );
  }

  getAllImmunizations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.SERVER_URL}/api/immunizations`).pipe(
      catchError(err => {
        console.error('[PatientService] Error fetching all immunizations:', err);
        const errorMessage = err.error?.error || err.error?.details || err.message || 'Failed to fetch immunizations';
        this.toastr.error(errorMessage, 'Immunizations Error');
        throw err;
      })
    );
  }

  getAllergiesExport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.SERVER_URL}/api/allergies`).pipe(
      catchError(err => {
        console.error('[PatientService] Error fetching all allergies:', err);
        const errorMessage = err.error?.error || err.error?.details || err.message || 'Failed to fetch allergies';
        this.toastr.error(errorMessage, 'Allergies Error');
        throw err;
      })
    );
  }

  getImmunizationAndConditionsByPatient(patientId: string): Observable<any> {
    return this.http.get<any>(`${this.SERVER_URL}/api/patients/${patientId}`);
  }

  //Clear frontend cache and trigger data refresh
  clearCacheAndRefresh(): void {
    // Clear localStorage cache
    localStorage.removeItem('grouped_patient_data');
    localStorage.removeItem('immunization_condition_binary_ids');
    
    // Clear server-side cache by calling the cache clear endpoint
    this.http.delete(`${this.SERVER_URL}/api/cache`).subscribe({
      next: () => {
        console.log('[DEBUG] Server cache cleared successfully');
      },
      error: (err) => {
        console.error('[DEBUG] Failed to clear server cache:', err);
      }
    });
  }

  //Refresh patient detail data for a specific patient
  refreshPatientDetailData(patientId: string): void {
    // Clear any cached data for this specific patient
    const groupedRaw = localStorage.getItem('grouped_patient_data');
    if (groupedRaw) {
      try {
        const grouped = JSON.parse(groupedRaw);
        if (grouped[patientId]) {
          delete grouped[patientId];
          localStorage.setItem('grouped_patient_data', JSON.stringify(grouped));
        }
      } catch (error) {
        console.error('[DEBUG] Error updating grouped patient data:', error);
      }
    }
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
            
            // Start monitoring import progress
            this.startImportMonitoring();
            
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

  startImportMonitoring(): void {
    if (this.isImporting) return;
    
    this._isImporting.next(true);
    this._importStatus.next('IN_PROGRESS');
    this.toastr.info('Export completed. Import process has started...', 'Import Started');
    
    // Wait a bit for the import to start, then start polling
    setTimeout(() => {
      this.pollImportStatus().subscribe({
        next: (importJob: ImportJob) => {
          this._isImporting.next(false);
          this._importStatus.next('COMPLETED');
          this._showImportNotif.next(true);
          this.updateLastImportDate();
          this.toastr.success('Import completed successfully! Refreshing page...', 'Import Complete');
          setTimeout(() => { this._showImportNotif.next(false); }, 3000);
          setTimeout(() => { this._importStatus.next('IDLE'); }, 5000);
          
          // Automatically refresh the page after import completion
          setTimeout(() => {
            this.refreshPage();
          }, 2000); // Wait 2 seconds before refreshing
        },
        error: (err) => {
          this._isImporting.next(false);
          this._importStatus.next('FAILED');
          this.toastr.error('Import failed: ' + (err?.message || err), 'Import Failed');
          setTimeout(() => { this._importStatus.next('IDLE'); }, 5000);
        }
      });
    }, 2000); // Wait 2 seconds for import to start
  }

  private refreshPage(): void {
    // Clear any cached data that might be stale
    this.clearCacheAndRefresh();
    
    // Refresh the page
    window.location.reload();
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