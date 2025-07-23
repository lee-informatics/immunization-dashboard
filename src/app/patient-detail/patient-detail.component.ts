import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../patient-list/patient.service';

@Component({
  selector: 'app-patient-detail',
  templateUrl: './patient-detail.component.html',
  styleUrls: ['./patient-detail.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe]
})
export class PatientDetailComponent implements OnInit {
  patientId: string = '';
  patient: any = null;
  immunizations: any[] = [];
  conditions: any[] = [];
  loadingPatient: boolean = false;
  allergies: any[] = [];
  loadingAllergies: boolean = false;
  allergyError: string | null = null;
  allergyButtonPressed: boolean = false;
  allergiesKeyExists: boolean = false;
  allergiesDisplayState: 'none' | 'not_found' | 'show' = 'none';

  // Sorting/filtering state
  immunSort: { key: string, dir: 'asc' | 'desc' } = { key: 'occurrenceDateTime', dir: 'desc' };
  immunFilters: { [key: string]: string } = {};
  condSort: { key: string, dir: 'asc' | 'desc' } = { key: 'onsetDateTime', dir: 'desc' };
  condFilters: { [key: string]: string } = {};

  constructor(private route: ActivatedRoute, private router: Router, private datePipe: DatePipe, private patientService: PatientService) {}

  ngOnInit() {
    this.patientId = this.route.snapshot.paramMap.get('id') || '';
    // Get patient info from window (already loaded in patient list)
    const patients = (window as any).allPatients || [];
    this.patient = patients.find((p: any) => p.id === this.patientId);
    if (!this.patient) {
      this.loadingPatient = true;
      this.patientService.getPatients().subscribe({
        next: (data: any[]) => {
          this.patient = data.find((p: any) => p.id === this.patientId);
          this.loadingPatient = false;
        },
        error: () => {
          this.loadingPatient = false;
        }
      });
    }
    // Get grouped data from cache
    const groupedRaw = localStorage.getItem('grouped_patient_data');
    if (groupedRaw) {
      const grouped = JSON.parse(groupedRaw);
      const entry = grouped[this.patientId];
      if (entry) {
        this.immunizations = entry.immunizations || [];
        this.conditions = entry.conditions || [];
      }
    }
    this.loadAllergiesFromCache();
  }

  loadAllergiesFromCache() {
    const groupedRaw = localStorage.getItem('grouped_patient_data');
    let allergies: any[] | undefined = undefined;
    this.allergiesDisplayState = 'none';
    if (groupedRaw) {
      try {
        const grouped = JSON.parse(groupedRaw);
        const entry = grouped[String(this.patientId)];
        if (entry && entry.hasOwnProperty('allergies')) {
          allergies = entry.allergies;
          if (Array.isArray(allergies) && allergies.length > 0) {
            this.allergiesDisplayState = 'show';
          } else {
            this.allergiesDisplayState = 'not_found';
          }
        } else {
          this.allergiesDisplayState = 'none';
        }
      } catch {
        this.allergiesDisplayState = 'none';
      }
    } else {
      this.allergiesDisplayState = 'none';
    }
    if (allergies !== undefined) {
      this.allergies = Array.isArray(allergies) ? allergies : [];
    } else {
      this.allergies = [];
    }
  }

  goBack() {
    this.router.navigate(['/']);
  }

  getRace(patient: any): string {
    if (!patient?.extension) return 'N/A';
    const raceExt = patient.extension.find((e: any) => e.url && e.url.includes('us-core-race'));
    let raceText = 'N/A';

    if (raceExt && raceExt.extension) {
      const textField = raceExt.extension.find((ext: any) => ext.url === 'text');
      if (textField && textField.valueString) {
        raceText = textField.valueString;
      }
    }
    return raceText
  }

  getBirthPlace(patient: any): string {
    if (!patient?.extension) return 'N/A';
    const birthPlaceExt = patient.extension.find((e: any) => e.url && e.url.includes('birthPlace'));
    if (!birthPlaceExt || !birthPlaceExt.valueAddress) return 'N/A';
    const { city, state, country } = birthPlaceExt.valueAddress;
    let parts = [];
    if (city) parts.push(city);
    if (state) parts.push(state);
    if (country) parts.push(country);
    return parts.length ? parts.join(', ') : 'N/A';
  }

  getEthnicity(patient: any): string {
    if (!patient?.extension) return 'N/A';
    const ethExt = patient.extension.find((e: any) => e.url && e.url.includes('ethnicity'));
    let raceText = 'N/A';

    if (ethExt && ethExt.extension) {
      const textField = ethExt.extension.find((ext: any) => ext.url === 'text');
      if (textField && textField.valueString) {
        raceText = textField.valueString;
      }
    }
    return raceText
  }

  getSortedFilteredImmunizations() {
    let data = this.immunizations;
    // Filtering
    Object.entries(this.immunFilters).forEach(([key, val]) => {
      if (val) {
        data = data.filter(imm => (imm[key] || '').toLowerCase().includes(val.toLowerCase()));
      }
    });
    // Sorting
    data = [...data].sort((a, b) => {
      const aVal = a[this.immunSort.key] || '';
      const bVal = b[this.immunSort.key] || '';
      if (aVal < bVal) return this.immunSort.dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.immunSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }

  getSortedFilteredConditions() {
    let data = this.conditions;
    Object.entries(this.condFilters).forEach(([key, val]) => {
      if (val) {
        data = data.filter(cond => (cond[key] || '').toLowerCase().includes(val.toLowerCase()));
      }
    });
    data = [...data].sort((a, b) => {
      const aVal = a[this.condSort.key] || '';
      const bVal = b[this.condSort.key] || '';
      if (aVal < bVal) return this.condSort.dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.condSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }

  getUniqueImmunStatuses(): string[] {
    const statuses = this.immunizations.map(imm => imm.status).filter(Boolean);
    return Array.from(new Set(statuses));
  }

  getUniqueCondStatuses(): string[] {
    const statuses = this.conditions.map(cond => cond.clinicalStatus?.coding?.[0]?.code).filter(Boolean);
    return Array.from(new Set(statuses));
  }

  setImmunSort(key: string) {
    if (this.immunSort.key === key) {
      this.immunSort.dir = this.immunSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      this.immunSort.key = key;
      this.immunSort.dir = 'asc';
    }
  }

  setCondSort(key: string) {
    if (this.condSort.key === key) {
      this.condSort.dir = this.condSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      this.condSort.key = key;
      this.condSort.dir = 'asc';
    }
  }

  formatDate(dateStr: string): string {
    return this.datePipe.transform(dateStr, 'MMM dd, yyyy') || dateStr;
  }

  getVaccinesForFiveYearOld(): { code: string; display: string }[] {
    return [
      { code: "20", display: "DTaP (5-dose series by age 4–6)" },
      { code: "10", display: "IPV (4-dose series by age 4–6)" },
      { code: "03", display: "MMR (2-dose series by age 4–6)" },
      { code: "21", display: "Varicella (2-dose series by age 4–6)" },
      { code: "140", display: "Influenza, seasonal (annual)" },
      // { code: "92", display: "Sample Vaccine" }
    ];
  }

  getMissingRecommendedVaccines(): { code: string; display: string }[] {
    const recommended = this.getVaccinesForFiveYearOld();
    const receivedCodes = new Set(
      this.immunizations.map(imm => imm.vaccineCode?.coding?.[0]?.code).filter(Boolean)
    );
    return recommended.filter(vax => !receivedCodes.has(vax.code));
  }

  /**
   * Returns the patient's age in years, or null if birthDate is missing/invalid.
   */
  getPatientAge(): number | null {
    if (!this.patient || !this.patient.birthDate) return null;
    const birthDate = new Date(this.patient.birthDate);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Fetch allergy information for the patient from TEFCA QHIN API
   */
  fetchAllergies() {
    console.log('fetchAllergies called');
    if (!this.patient?.id) {
      console.log('No patient or patient.id:', this.patient);
      return;
    }
    console.log('fetchAllergies for patientId:', this.patient.id, 'patient object:', this.patient);
    this.allergyButtonPressed = true;
    this.loadingAllergies = true;
    this.allergyError = null;
    setTimeout(() => {
      const groupedRaw = localStorage.getItem('grouped_patient_data');
      let allergies: any[] | undefined = undefined;
      this.allergiesDisplayState = 'none';
      if (groupedRaw) {
        try {
          const grouped = JSON.parse(groupedRaw);
          console.log('Grouped cache keys:', Object.keys(grouped));
          const entry = grouped[String(this.patient.id)];
          console.log('Looking for patient.id:', this.patient.id, 'Found entry:', entry);
          if (entry && entry.hasOwnProperty('allergies')) {
            allergies = entry.allergies;
            if (Array.isArray(allergies) && allergies.length > 0) {
              this.allergiesDisplayState = 'show';
            } else {
              this.allergiesDisplayState = 'not_found';
            }
            console.log('Allergies found:', allergies);
          } else {
            this.allergiesDisplayState = 'none';
            console.log('No allergies key in entry for patient:', this.patient.id);
          }
        } catch (e) {
          this.allergiesDisplayState = 'none';
          console.error('Error parsing grouped_patient_data', e);
        }
      } else {
        this.allergiesDisplayState = 'none';
        console.log('No grouped_patient_data found in localStorage');
      }
      if (allergies !== undefined) {
        this.allergies = Array.isArray(allergies) ? allergies : [];
        this.loadingAllergies = false;
      } else {
        this.allergies = [];
        this.loadingAllergies = false;
      }
    }, 0);
  }
}