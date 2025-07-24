import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataApiService {
    private SERVER_URL = (window as any)["LOCAL_FHIR_URL"] || '';

    constructor(private http: HttpClient) {}

  getActiveVaccines(): Observable<any[]> {
    return this.http.get<any[]>(`${this.SERVER_URL}/api/active-vaccines`);
  }

  getMedications(): Observable<any[]> {
    return this.http.get<any[]>(`${this.SERVER_URL}/api/medications`);
  }

  getPractitioners(): Observable<any[]> {
    return this.http.get<any[]>(`${this.SERVER_URL}/api/practitioners`);
  }
} 