import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataApiService {

  public serverURL = (window as any)["IMMUNIZATION_SERVER_URL"];

  constructor(private http: HttpClient) { 
    if (this.serverURL) {
      console.log(`DataApiService initialized with server URL: ${this.serverURL}`);
    } else {
      console.warn('IMMUNIZATION_SERVER_URL is not set. This will likely prevent the application from functioning correctly.');
    }
  }

  getActiveVaccines(): Observable<any[]> {
    return this.http.get<any[]>(`${this.serverURL}/api/active-vaccines`);
  }

  getMedications(): Observable<any[]> {
    return this.http.get<any[]>(`${this.serverURL}/api/medications`);
  }

  getPractitioners(): Observable<any[]> {
    return this.http.get<any[]>(`${this.serverURL}/api/practitioners`);
  }
} 