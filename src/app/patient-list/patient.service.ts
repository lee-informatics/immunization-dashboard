import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap, timer, throwError } from 'rxjs';
import { catchError, filter, take, map as rxMap } from 'rxjs/operators';

const typesToExport = ["Immunization","Condition"]

@Injectable({ providedIn: 'root' })
export class PatientService {
  private fhirBaseUrl = (window as any)["IMMUNIZATION_DEFAULT_FHIR_URL"] || '';
  private apiUrl = this.fhirBaseUrl + '/Patient?_count=100';
  private exportUrl = this.fhirBaseUrl + '/Patient/$export';

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
} 