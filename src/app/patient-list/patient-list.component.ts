import { Component, OnInit, QueryList, ViewChildren, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../service/patient.service';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-patient-list',
  templateUrl: './patient-list.component.html',
  styleUrls: ['./patient-list.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class PatientListComponent implements OnInit, OnDestroy {
  patients: any[] = [];
  loading = true;
  error: string | null = null;

  // Search and pagination state
  searchQuery: string = '';
  currentPage: number = 1;
  pageSize: number = 9;

  // Filter state
  genderFilter: string = '';
  birthYearFilter: string = '';
  maritalStatusFilter: string = '';
  languageFilter: string = '';
  raceFilter: string = '';
  birthPlaceFilter: string = '';

  // Immunization state - now managed by service
  isSyncing: boolean = false;
  isDone: boolean = false;
  showExportNotif: boolean = false;
  lastExportDate: string | null = null;

  // Allergy state
  isSyncingAllergies: boolean = false;
  isAllergyDone: boolean = false;
  showAllergyExportNotif: boolean = false;
  lastAllergyExportDate: string | null = null;

  @ViewChildren('nameSpan') nameSpans!: QueryList<ElementRef>;
  nameOverflow: boolean[] = [];

  private CACHE_KEY = 'immunization_condition_binary_ids';
  private GROUPED_CACHE_KEY = 'grouped_patient_data';

  private subscriptions: Subscription[] = [];

  constructor(private patientService: PatientService, private router: Router) {}

  ngOnInit() {
    this.patientService.getPatients().subscribe({
      next: (data) => {
        this.patients = data;
        (window as any).allPatients = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load patients.';
        this.loading = false;
      }
    });
    
    // Subscribe to service state for immunization processing
    const immunizationSub = this.patientService.isSyncing$.subscribe(isSyncing => this.isSyncing = isSyncing);
    const immunizationDoneSub = this.patientService.isDone$.subscribe(isDone => this.isDone = isDone);
    const immunizationNotifSub = this.patientService.showExportNotif$.subscribe(showNotif => this.showExportNotif = showNotif);
    const immunizationDateSub = this.patientService.lastExportDate$.subscribe(date => this.lastExportDate = date);
    this.subscriptions.push(immunizationSub, immunizationDoneSub, immunizationNotifSub, immunizationDateSub);
    
    this.lastAllergyExportDate = localStorage.getItem('lastAllergyExportDate');
  }

  ngAfterViewInit() {
    this.updateNameOverflow();
    this.nameSpans.changes.subscribe(() => this.updateNameOverflow());
  }

  ngOnChanges() {
    this.updateNameOverflow();
  }

  updateNameOverflow() {
    this.nameOverflow = this.nameSpans.map(span => {
      const el = span.nativeElement as HTMLElement;
      return el.scrollWidth > el.clientWidth;
    });
  }

  getCachedBinaryIds(): { Immunization: string[]; Condition: string[] } | null {
    const raw = localStorage.getItem(this.CACHE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setCachedBinaryIds(ids: { Immunization: string[]; Condition: string[] }) {
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(ids));
  }

  updateImmunization() {
    if (this.isSyncing) return;
    
    const cached = this.getCachedBinaryIds();
    if (cached && (cached.Immunization.length > 0 || cached.Condition.length > 0)) {
      const useCache = window.confirm('Use cached Immunization/Condition data?');
      if (useCache) {
        // Use cached data - trigger notification through service
        this.patientService.showNotification();
        this.patientService.updateLastExportDate();
        return;
      }
    }
    
    // Start background processing that will continue even if component is destroyed
    this.patientService.startBackgroundImmunizationExport();
  }

  async updateAllAllergies() {
    if (this.isSyncingAllergies) return;
    this.isSyncingAllergies = true;
    this.isAllergyDone = false;
    try {
      // Fetch all allergies using the export API
      const allergies = await this.patientService.getAllergiesExport().toPromise();
      // Optionally, do something with the allergies data here (e.g., display, process, etc.)
      this.lastAllergyExportDate = new Date().toLocaleString();
      localStorage.setItem('lastAllergyExportDate', this.lastAllergyExportDate);
      this.showAllergyExportNotif = true;
      setTimeout(() => { this.showAllergyExportNotif = false; }, 3000);
    } catch (err) {
      // Optionally, handle error (e.g., show error notification)
    }
    this.isSyncingAllergies = false;
    this.isAllergyDone = true;
    setTimeout(() => { this.isAllergyDone = false; }, 3000);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get filteredPatients(): any[] {
    let filtered = this.patients;
    const query = this.searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter(patient => {
        const name = (patient.name?.[0]?.text || (patient.name?.[0]?.given?.join(' ') + ' ' + patient.name?.[0]?.family) || '').toLowerCase();
        const identifiers = (patient.identifier || []).map((id: any) => id.value?.toLowerCase()).join(' ');
        return name.includes(query) || identifiers.includes(query);
      });
    }
    if (this.genderFilter) {
      filtered = filtered.filter(p => p.gender === this.genderFilter);
    }
    if (this.birthYearFilter) {
      filtered = filtered.filter(p => (p.birthDate && p.birthDate.startsWith(this.birthYearFilter)));
    }
    if (this.maritalStatusFilter) {
      filtered = filtered.filter(p => p.maritalStatus?.text === this.maritalStatusFilter);
    }
    if (this.languageFilter) {
      filtered = filtered.filter(p => p.communication?.some((c: any) => c.language?.text === this.languageFilter));
    }
    if (this.raceFilter) {
      filtered = filtered.filter(p => this.getRace(p) === this.raceFilter);
    }
    if (this.birthPlaceFilter) {
      filtered = filtered.filter(p => this.getBirthPlace(p) === this.birthPlaceFilter);
    }
    return filtered;
  }

  // Helpers to extract unique filter values
  get genderOptions(): string[] {
    return Array.from(new Set(this.patients.map(p => p.gender).filter(Boolean)));
  }
  get birthYearOptions(): string[] {
    return Array.from(new Set(this.patients.map(p => p.birthDate?.slice(0, 4)).filter(Boolean))).sort();
  }
  get maritalStatusOptions(): string[] {
    return Array.from(new Set(this.patients.map(p => p.maritalStatus?.text).filter(Boolean)));
  }
  get languageOptions(): string[] {
    return Array.from(new Set(this.patients.flatMap(p => (p.communication || []).map((c: any) => c.language?.text)).filter(Boolean)));
  }
  get raceOptions(): string[] {
    return Array.from(new Set(this.patients.map(p => this.getRace(p)).filter(r => r && r !== 'N/A')));
  }

  get birthPlaceOptions(): string[] {
    return Array.from(new Set(this.patients.map(p => this.getBirthPlace(p)).filter(bp => bp && bp !== 'N/A')));
  }

  get paginatedPatients(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredPatients.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredPatients.length / this.pageSize) || 1;
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  prevPage() {
    if (this.currentPage > 1) this.currentPage--;
  }

  nextPage() {
    if (this.currentPage < this.totalPages) this.currentPage++;
  }

  goToPatient(id: string) {
    this.router.navigate(['/patient', id]);
  }

  getPhone(patient: any): string {
    if (!patient.telecom) return 'N/A';
    const phone = patient.telecom.find((t: any) => t.system === 'phone');
    return phone?.value || 'N/A';
  }

  getRace(patient: any): string {
    if (!patient.extension) return 'N/A';
    const raceExt = patient.extension.find((e: any) => e.url && e.url.includes('race'));
    return raceExt?.valueString || 'N/A';
  }

  getBirthPlace(patient: any): string {
    if (!patient.extension) return 'N/A';
    const birthPlaceExt = patient.extension.find((e: any) => e.url === 'http://hl7.org/fhir/StructureDefinition/patient-birthPlace');
    if (!birthPlaceExt || !birthPlaceExt.valueAddress) return 'N/A';
    const { city, state, country } = birthPlaceExt.valueAddress;
    let parts = [];
    if (city) parts.push(city);
    if (state) parts.push(state);
    if (country) parts.push(country);
    return parts.length ? parts.join(', ') : 'N/A';
  }
} 