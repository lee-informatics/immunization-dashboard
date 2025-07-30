import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../service/patient.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-patient-detail',
  templateUrl: './patient-detail.component.html',
  styleUrls: ['./patient-detail.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe]
})
export class PatientDetailComponent implements OnInit, OnDestroy {
  patientId: string = '';
  patient: any = null;
  immunizations: any[] = [];
  conditions: any[] = [];
  loadingPatient: boolean = false;
  loadingImmunizations: boolean = false;
  loadingConditions: boolean = false;
  immunizationError: string | null = null;
  conditionError: string | null = null;
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

  private routeSubscription?: Subscription;
  private navigationSubscription?: Subscription;

  constructor(private route: ActivatedRoute, private router: Router, private datePipe: DatePipe, private patientService: PatientService) {}

  ngOnInit() {
    console.log('[DEBUG] ngOnInit called');
    this.patientId = this.route.snapshot.paramMap.get('id') || '';
    console.log('[DEBUG] Patient ID from route:', this.patientId);
    
    // Subscribe to route changes to refresh data when navigating back
    this.routeSubscription = this.route.params.subscribe(params => {
      const newPatientId = params['id'];
      if (newPatientId && newPatientId !== this.patientId) {
        this.patientId = newPatientId;
        this.loadPatientData();
      }
    });
    
    // Subscribe to query parameter changes to detect refresh requests
    this.route.queryParams.subscribe(queryParams => {
      if (queryParams['refresh']) {
        console.log('[DEBUG] Refresh parameter detected, refreshing data');
        this.refreshAllData();
      }
    });
    
    // Subscribe to navigation events to refresh data when returning from administer
    this.navigationSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      console.log('[DEBUG] Navigation event detected:', event.url);
      // Check if we're navigating to this patient detail page from administer
      if (event.url.includes(`/patient/${this.patientId}`) && !event.url.includes('/administer')) {
        console.log('[DEBUG] Navigation detected to patient detail, refreshing data');
        // Add a small delay to ensure the component is fully loaded
        setTimeout(() => {
          this.refreshAllData();
        }, 100);
      }
    });
    
    this.loadPatientData();
  }

  ngOnDestroy() {
    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe();
    }
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
  }

  loadPatientData() {
    // Get patient info from window (already loaded in patient list)
    const patients = (window as any).allPatients || [];
    console.log('[DEBUG] Patients from window:', patients);
    this.patient = patients.find((p: any) => p.id === this.patientId);
    console.log('[DEBUG] Found patient:', this.patient);
    if (!this.patient) {
      console.log('[DEBUG] Patient not found in window, fetching from API');
      this.loadingPatient = true;
      this.patientService.getPatients().subscribe({
        next: (data: any[]) => {
          console.log('[DEBUG] Patients API response:', data);
          this.patient = data.find((p: any) => p.id === this.patientId);
          console.log('[DEBUG] Patient found from API:', this.patient);
          this.loadingPatient = false;
          if (this.patient) {
            console.log('[DEBUG] Calling fetchImmunizations, fetchConditions and fetchAllergies');
            this.fetchImmunizations();
            this.fetchConditions();
            this.loadAllergiesFromCache(); // Load from cache first
            this.fetchAllergies(); // Then fetch fresh data
          }
        },
        error: (err) => {
          console.error('[DEBUG] Error fetching patients:', err);
          this.loadingPatient = false;
        }
      });
    } else {
      console.log('[DEBUG] Patient found in window, calling fetchImmunizations, fetchConditions and fetchAllergies');
      this.fetchImmunizations();
      this.fetchConditions();
      this.loadAllergiesFromCache(); // Load from cache first
      this.fetchAllergies(); // Then fetch fresh data
    }
  }

  // Refresh all patient data (called after administration)
  refreshAllData() {
    console.log('[DEBUG] Refreshing all patient data for patient:', this.patientId);
    // Clear any cached data first
    this.patientService.clearCacheAndRefresh();
    // Fetch fresh data
    this.fetchImmunizations();
    this.fetchConditions();
    this.fetchAllergies();
  }

  fetchImmunizations() {
    this.loadingImmunizations = true;
    this.immunizationError = null;
    this.patientService.getImmunizationsByPatient(this.patientId).subscribe({
      next: (data: any[]) => {
        this.immunizations = Array.isArray(data) ? data : [];
        this.loadingImmunizations = false;
        console.log('[DEBUG] Immunizations loaded:', this.immunizations.length);
      },
      error: (err) => {
        console.error('[DEBUG] Error fetching immunizations:', err);
        this.immunizations = [];
        this.loadingImmunizations = false;
        this.immunizationError = err?.error?.error || err?.message || 'Failed to fetch immunization records.';
      }
    });
  }

  fetchConditions() {
    this.loadingConditions = true;
    this.conditionError = null;
    this.patientService.getConditionsByPatient(this.patientId).subscribe({
      next: (data: any[]) => {
        this.conditions = Array.isArray(data) ? data : [];
        this.loadingConditions = false;
        console.log('[DEBUG] Conditions loaded:', this.conditions.length);
      },
      error: (err) => {
        console.error('[DEBUG] Error fetching conditions:', err);
        this.conditions = [];
        this.loadingConditions = false;
        this.conditionError = err?.error?.error || err?.message || 'Failed to fetch condition records.';
      }
    });
  }

  fetchImmunizationAndConditions() {
    this.loadingPatient = true;
    this.patientService.getImmunizationAndConditionsByPatient(this.patientId).subscribe({
      next: (data: any) => {
        this.immunizations = Array.isArray(data.Immunization) ? data.Immunization : [];
        this.conditions = Array.isArray(data.Condition) ? data.Condition : [];
        this.loadingPatient = false;
      },
      error: (err) => {
        this.immunizations = [];
        this.conditions = [];
        this.loadingPatient = false;
      }
    });
  }

  loadAllergiesFromCache() {
    console.log('[DEBUG] loadAllergiesFromCache called');
    const groupedRaw = localStorage.getItem('grouped_patient_data');
    console.log('[DEBUG] grouped_patient_data from localStorage:', groupedRaw);
    let allergies: any[] | undefined = undefined;
    this.allergiesDisplayState = 'none';
    if (groupedRaw) {
      try {
        const grouped = JSON.parse(groupedRaw);
        console.log('[DEBUG] Parsed grouped data:', grouped);
        const entry = grouped[String(this.patientId)];
        console.log('[DEBUG] Entry for patient ID', this.patientId, ':', entry);
        if (entry && entry.hasOwnProperty('allergies')) {
          allergies = entry.allergies;
          console.log('[DEBUG] Allergies from cache:', allergies);
          if (Array.isArray(allergies) && allergies.length > 0) {
            this.allergiesDisplayState = 'show';
          } else {
            this.allergiesDisplayState = 'not_found';
          }
        } else {
          this.allergiesDisplayState = 'none';
        }
      } catch (error) {
        console.error('[DEBUG] Error parsing grouped data:', error);
        this.allergiesDisplayState = 'none';
      }
    } else {
      console.log('[DEBUG] No grouped_patient_data in localStorage');
      this.allergiesDisplayState = 'none';
    }
    if (allergies !== undefined) {
      this.allergies = Array.isArray(allergies) ? allergies : [];
    } else {
      this.allergies = [];
    }
    console.log('[DEBUG] Final allergies array:', this.allergies);
    console.log('[DEBUG] Final allergiesDisplayState:', this.allergiesDisplayState);
  }

  goBack() {
    this.router.navigate(['/']);
  }

  navigateToAdminister() {
    this.router.navigate(['/patient', this.patientId, 'administer']);
  }

  navigateToAdministerImmunization() {
    this.router.navigate(['/patient', this.patientId, 'administer-immunization']);
  }

  navigateToAdministerMedication() {
    this.router.navigate(['/patient', this.patientId, 'administer-medication']);
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

  
  // Fetch allergy information for the patient from backend API
  fetchAllergies() {
    console.log('[DEBUG] fetchAllergies called with patient:', this.patient);
    if (!this.patient?.id) {
      console.log('[DEBUG] No patient ID found, returning early');
      this.allergyError = 'No patient selected.';
      return;
    }
    console.log('[DEBUG] Calling getAllergiesByPatient with patient ID:', this.patient.id);
    this.allergyButtonPressed = true;
    this.loadingAllergies = true;
    this.allergyError = null;
    this.patientService.getAllergiesByPatient(this.patient.id).subscribe({
      next: (allergies: any[]) => {
        console.log('[DEBUG] Allergies API response:', allergies);
        this.allergies = Array.isArray(allergies) ? allergies : [];
        if (this.allergies.length > 0) {
          this.allergiesDisplayState = 'show';
        } else {
          this.allergiesDisplayState = 'not_found';
        }
        this.loadingAllergies = false;
      },
      error: (err) => {
        console.error('[DEBUG] Allergies API error:', err);
        this.allergies = [];
        this.allergiesDisplayState = 'none';
        this.loadingAllergies = false;
        this.allergyError = err?.error?.error || err?.message || 'Failed to fetch allergy information.';
      }
    });
  }
}