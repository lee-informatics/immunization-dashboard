import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { SettingsService } from '../settings/settings.service';
import { DataApiService } from './data-api.service';

@Injectable({ providedIn: 'root' })
export class AdministerService {

  constructor(protected settingsService: SettingsService, protected dataApiService: DataApiService, private http: HttpClient, private toastr: ToastrService) {}

  // Clear frontend cache and trigger data refresh
  clearCacheAndRefresh(): void {
    // Clear localStorage cache
    localStorage.removeItem('grouped_patient_data');
    localStorage.removeItem('immunization_condition_binary_ids');
    
    // Clear server-side cache by calling the cache clear endpoint
    this.http.delete(`${this.dataApiService.serverURL}/api/cache`).subscribe({
      next: () => {
        console.log('[DEBUG] Server cache cleared successfully');
      },
      error: (err) => {
        console.error('[DEBUG] Failed to clear server cache:', err);
      }
    });
  }

  administerImmunizations(patientId: string, selectedImmunizations: string[], practitioner: any, immunizationList: any[]): Promise<any[]> {
    const requests = selectedImmunizations.map(id => {
      const imm = immunizationList.find((i: any) => i.id === id);
      if (!imm) return Promise.resolve();
      const immunizationResource = {
        resourceType: 'Immunization',
        status: 'completed',
        vaccineCode: {
          coding: [{
            system: 'http://hl7.org/fhir/sid/cvx',
            code: String(imm.cvxCode),
            display: imm.name
          }]
        },
        patient: {
          reference: `Patient/${patientId}`
        },
        occurrenceDateTime: new Date().toISOString(),
        primarySource: true,
        lotNumber: Math.random().toString(36).substring(2, 10)
      };
      return this.http.post(`${this.dataApiService.serverURL}/api/administer/immunization`, immunizationResource).toPromise();
    });
    
    return Promise.all(requests).then(results => {
      // Clear cache and refresh data after successful administration
      this.clearCacheAndRefresh();
      return results;
    });
  }

  administerMedications(patientId: string, selectedMedications: string[], practitioner: any, medicationList: any[]): Promise<any[]> {
    const requests = selectedMedications.map(id => {
      const med = medicationList.find((m: any) => m.id === id);
      if (!med) return Promise.resolve();
      const medicationResource = {
        resourceType: 'MedicationAdministration',
        status: 'completed',
        subject: {
          reference: `Patient/${patientId}`
        },
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: String(med.rxnormCode || med.id),
              display: med.name
            }
          ],
          text: med.name
        },
        effectiveDateTime: new Date().toISOString(),
        performer: practitioner ? [{
          actor: {
            reference: `Practitioner/${practitioner.id}`
          }
        }] : undefined,
        dosage: med.dosage || undefined
      };
      return this.http.post(`${this.dataApiService.serverURL}/api/administer/medication`, medicationResource).toPromise();
    });
    
    return Promise.all(requests).then(results => {
      // Clear cache and refresh data after successful administration
      this.clearCacheAndRefresh();
      return results;
    });
  }

  showSuccess(message: string): void {
    this.toastr.success(message);
  }

  showError(message: string): void {
    this.toastr.error(message);
  }
} 