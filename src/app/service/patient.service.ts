import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, timer, switchMap, map, filter, take, catchError, throwError, BehaviorSubject, firstValueFrom } from 'rxjs';
import { map as rxMap } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { DataApiService } from './data-api.service';
import { TOAST_TIMEOUT } from '../constants';

interface ImportJob {
  importJobId: string;
  exportJobId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  finishedAt?: string;
  error?: string;
  result?: any;
}

interface TransactionJob {
  jobId: string;
  status: 'IN_PROGRESS' | 'FINISHED' | 'FAILED';
  createdAt: string;
  completedAt?: string;
  resourcesCount?: number;
  result?: any;
  error?: string;
  type: string;
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
    setTimeout(() => { this._showExportNotif.next(false); }, TOAST_TIMEOUT);
  }

  showImportNotification(): void {
    this._showImportNotif.next(true);
    setTimeout(() => { this._showImportNotif.next(false); }, TOAST_TIMEOUT);
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
        const detailedError = err.error?.error || err.error?.details || err.message || 'Failed to fetch patients';
        console.error('[PatientService] Detailed patients error:', detailedError);
        this.toastr.error('Failed to fetch patients', 'Connection Error');
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
        const detailedError = err.error?.error || err.error?.details || err.message || 'Failed to start export job';
        console.error('[PatientService] Detailed export job error:', detailedError);
        this.toastr.error('Failed to start export', 'Export Error');
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
          const detailedError = 'Export failed or returned unexpected status: ' + res.status;
          console.error('[PatientService] Detailed export error:', detailedError, 'Response:', res);
          throw new Error('Export failed');
        }
      }),
      filter(result => result !== null), // Only emit when done
      take(1), // Complete after first 200 response
      catchError(err => {
        console.error('[PatientService] Error polling export status:', err);
        const detailedError = err.error?.error || err.error?.details || err.message || 'Failed to check export status';
        console.error('[PatientService] Detailed error details:', detailedError);
        this.toastr.error('Export failed', 'Export Error');
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
            const detailedError = 'Import failed: ' + (importJob.error || 'Unknown error');
            console.error('[PatientService] Detailed import error:', detailedError, 'ImportJob:', importJob);
            throw new Error('Import failed');
          } else {
            // No import job found or other status
            return null;
          }
        } else {
          const detailedError = 'Failed to get import status: ' + res.status;
          console.error('[PatientService] Detailed import status error:', detailedError, 'Response:', res);
          throw new Error('Import status check failed');
        }
      }),
      filter((result): result is ImportJob => result !== null), // Only emit when done
      take(1), // Complete after first successful response
      catchError(err => throwError(() => err))
    );
  }

  startTransaction(): Observable<{ jobId: string; pollUrl: string }> {
    console.log('[PatientService] Starting transaction, SERVER_URL:', this.SERVER_URL);
    return this.http.post<any>(`${this.SERVER_URL}/api/transact`, {}, { observe: 'response' }).pipe(
      map(res => {
        console.log('[PatientService] Transaction response:', res);
        if (res.status === 201) {
          const { jobId, pollUrl } = res.body;
          if (!jobId) throw new Error('No jobId returned from transaction start');
          console.log('[PatientService] Transaction started successfully:', { jobId, pollUrl });
          return { jobId, pollUrl };
        } else {
          console.error('[PatientService] Unexpected status code:', res.status);
          throw new Error('Failed to start transaction');
        }
      }),
      catchError(err => {
        console.error('[PatientService] Error starting transaction:', err);
        console.error('[PatientService] Error details:', {
          status: err.status,
          statusText: err.statusText,
          error: err.error,
          message: err.message
        });
        const detailedError = err.error?.error || err.error?.details || err.message || 'Failed to start transaction';
        console.error('[PatientService] Detailed transaction start error:', detailedError);
        this.toastr.error('Failed to start transaction', 'Transaction Error');
        throw err;
      })
    );
  }

  pollTransactionStatus(jobId: string): Observable<TransactionJob> {
    return timer(0, 5000).pipe(
      switchMap(() => this.http.get(`${this.SERVER_URL}/api/transact/status`, { 
        params: { jobId }, 
        observe: 'response' 
      })),
      map(res => {
        if (res.status === 200) {
          const transactionJob = res.body as TransactionJob;
          if (!transactionJob) {
            // No transaction job found
            return null;
          }
          if (transactionJob.status === 'IN_PROGRESS') {
            // Still processing, keep polling
            return null;
          } else if (transactionJob.status === 'FINISHED') {
            // Transaction completed!
            return transactionJob;
          } else if (transactionJob.status === 'FAILED') {
            // Transaction failed
            const detailedError = 'Transaction failed: ' + (transactionJob.error || 'Unknown error');
            console.error('[PatientService] Detailed transaction error:', detailedError, 'TransactionJob:', transactionJob);
            throw new Error('Transaction failed');
          } else {
            // No transaction job found or other status
            return null;
          }
        } else if (res.status === 202) {
          // Still processing, keep polling
          return null;
        } else {
          const detailedError = 'Failed to get transaction status: ' + res.status;
          console.error('[PatientService] Detailed transaction status error:', detailedError, 'Response:', res);
          throw new Error('Transaction status check failed');
        }
      }),
      filter((result): result is TransactionJob => result !== null), // Only emit when done
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
        const detailedError = err.error?.error || err.error?.details || err.message || 'Failed to fetch allergies';
        console.error('[PatientService] Detailed allergies error:', detailedError);
        this.toastr.error('Failed to fetch allergies', 'Allergies Error');
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
        const detailedError = err.error?.error || err.error?.details || err.message || 'Failed to fetch conditions';
        console.error('[PatientService] Detailed conditions error:', detailedError);
        this.toastr.error('Failed to fetch conditions', 'Conditions Error');
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
        const detailedError = err.error?.error || err.error?.details || err.message || 'Failed to fetch immunizations';
        console.error('[PatientService] Detailed immunizations error:', detailedError);
        this.toastr.error('Failed to fetch immunizations', 'Immunizations Error');
        throw err;
      })
    );
  }

  getAllConditions(): Observable<any[]> {
    return this.http.get<any[]>(`${this.SERVER_URL}/api/conditions`).pipe(
      catchError(err => {
        console.error('[PatientService] Error fetching all conditions:', err);
        const detailedError = err.error?.error || err.error?.details || err.message || 'Failed to fetch conditions';
        console.error('[PatientService] Detailed conditions error:', detailedError);
        this.toastr.error('Failed to fetch conditions', 'Conditions Error');
        throw err;
      })
    );
  }

  getAllImmunizations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.SERVER_URL}/api/immunizations`).pipe(
      catchError(err => {
        console.error('[PatientService] Error fetching all immunizations:', err);
        const detailedError = err.error?.error || err.error?.details || err.message || 'Failed to fetch immunizations';
        console.error('[PatientService] Detailed immunizations error:', detailedError);
        this.toastr.error('Failed to fetch immunizations', 'Immunizations Error');
        throw err;
      })
    );
  }

  getAllergiesExport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.SERVER_URL}/api/allergies`).pipe(
      catchError(err => {
        console.error('[PatientService] Error fetching all allergies:', err);
        const detailedError = err.error?.error || err.error?.details || err.message || 'Failed to fetch allergies';
        console.error('[PatientService] Detailed allergies error:', detailedError);
        this.toastr.error('Failed to fetch allergies', 'Allergies Error');
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
            setTimeout(() => { this._showExportNotif.next(false); }, TOAST_TIMEOUT);
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
            console.error('[PatientService] Detailed export error:', err);
            this.toastr.error('Export failed', 'Export Error');
          }
        });
      },
      error: (err) => {
        this._isSyncing.next(false);
        this._isDone.next(false);
        console.error('[PatientService] Detailed export job error:', err);
        this.toastr.error('Export failed', 'Export Error');
      }
    });
  }

  startImportMonitoring(): void {
    if (this.isImporting) return;
    
    this._isImporting.next(true);
    this._importStatus.next('IN_PROGRESS');
    this.toastr.info('Starting import...');
    
    // Start the transaction and then poll for status
    this.startTransaction().subscribe({
      next: ({ jobId, pollUrl }) => {
        console.log(`[PatientService] Transaction started with jobId: ${jobId}, pollUrl: ${pollUrl}`);
        
        // Start polling the specific job
        this.pollTransactionStatus(jobId).subscribe({
          next: (transactionJob: TransactionJob) => {
            this._isImporting.next(false);
            this._importStatus.next('COMPLETED');
            this._showImportNotif.next(true);
            this.updateLastImportDate();
            this.toastr.success("Import Complete, refreshing page.");
            setTimeout(() => { this._showImportNotif.next(false); }, TOAST_TIMEOUT);
            setTimeout(() => { this._importStatus.next('IDLE'); }, 5000);
            
            // Automatically refresh the page after transaction completion
            setTimeout(() => {
              this.refreshPage();
            }, 2000); // Wait 2 seconds before refreshing
          },
          error: (err) => {
            this._isImporting.next(false);
            this._importStatus.next('FAILED');
            console.error('[PatientService] Detailed transaction error:', err);
            this.toastr.error('Transaction failed', 'Transaction Failed');
            setTimeout(() => { this._importStatus.next('IDLE'); }, 5000);
          }
        });
      },
      error: (err) => {
        this._isImporting.next(false);
        this._importStatus.next('FAILED');
        console.error('[PatientService] Error starting transaction:', err);
        this.toastr.error('Failed to start transaction', 'Transaction Error');
        setTimeout(() => { this._importStatus.next('IDLE'); }, 5000);
      }
    });
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

  async clearBothCaches() {
    try {
      // Store settings before clearing
      const settings = localStorage.getItem('settings');
      const settingsForceReset = localStorage.getItem('settings_force_reset');
      
      // Clear server cache first
      let serverSuccess = false;
      try {
        await firstValueFrom(this.http.delete(`${this.dataApiService.serverURL}/api/cache`));
        console.log('Server cache cleared successfully');
        this.toastr.success('Server cache cleared', 'Cache Cleared');
        serverSuccess = true;
      } catch (serverError) {
        console.error('Failed to clear server cache:', serverError);
        this.toastr.error('Failed to clear server cache', 'Server Cache Error');
      }
      
      // Clear local cache
      let clientSuccess = false;
      try {
        localStorage.clear();
        sessionStorage.clear();
        
        // Restore settings
        if (settings) {
          localStorage.setItem('settings', settings);
        }
        if (settingsForceReset) {
          localStorage.setItem('settings_force_reset', settingsForceReset);
        }
        
        console.log('Client cache cleared successfully');
        this.toastr.success('Client cache cleared', 'Cache Cleared');
        clientSuccess = true;
      } catch (clientError) {
        console.error('Failed to clear client cache:', clientError);
        this.toastr.error('Failed to clear client cache', 'Client Cache Error');
      }
      
      // Show summary notification
      if (serverSuccess && clientSuccess) {
        this.toastr.success('All caches cleared successfully', 'Cache Cleared');
      } else if (!serverSuccess && !clientSuccess) {
        this.toastr.error('Failed to clear any caches', 'Cache Error');
      }
      
      // Reload page if at least one cache was cleared
      if (serverSuccess || clientSuccess) {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to clear caches:', error);
      this.toastr.error('Failed to clear caches', 'Cache Error');
    }
  }
} 