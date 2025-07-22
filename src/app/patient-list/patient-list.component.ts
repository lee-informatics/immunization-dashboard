import { Component, OnInit, QueryList, ViewChildren, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from './patient.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-patient-list',
  templateUrl: './patient-list.component.html',
  styleUrls: ['./patient-list.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class PatientListComponent implements OnInit {
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

  isSyncing: boolean = false;
  isDone: boolean = false;
  showExportNotif: boolean = false;
  lastExportDate: string | null = null;

  @ViewChildren('nameSpan') nameSpans!: QueryList<ElementRef>;
  nameOverflow: boolean[] = [];

  private CACHE_KEY = 'immunization_condition_binary_ids';
  private GROUPED_CACHE_KEY = 'grouped_patient_data';

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
    this.lastExportDate = localStorage.getItem('lastExportDate');
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
    this.isDone = false;
    const cached = this.getCachedBinaryIds();
    if (cached && (cached.Immunization.length > 0 || cached.Condition.length > 0)) {
      const useCache = window.confirm('Use cached Immunization/Condition data?');
      if (useCache) {
        this.isDone = true;
        this.showExportNotif = true;
        setTimeout(() => { this.showExportNotif = false; }, 3000);
        this.lastExportDate = new Date().toLocaleString();
        localStorage.setItem('lastExportDate', this.lastExportDate);
        setTimeout(() => { this.isDone = false; }, 2500);
        return;
      }
    }
    this.isSyncing = true;
    this.patientService.startExportJob().subscribe({
      next: (pollUrl) => {
        this.patientService.pollExportStatus(pollUrl).subscribe({
          next: (result) => {
            this.isSyncing = false;
            this.isDone = true;
            this.showExportNotif = true;
            setTimeout(() => { this.showExportNotif = false; }, 3000);
            this.lastExportDate = new Date().toLocaleString();
            localStorage.setItem('lastExportDate', this.lastExportDate);
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
            this.setCachedBinaryIds(ids);
            this.groupAndCachePatientData(ids.Immunization, ids.Condition);
            setTimeout(() => { this.isDone = false; }, 2500);
          },
          error: (err) => {
            this.isSyncing = false;
            this.isDone = false;
            alert('Export failed: ' + (err?.message || err));
          }
        });
      },
      error: (err) => {
        this.isSyncing = false;
        this.isDone = false;
        alert('Export failed: ' + (err?.message || err));
      }
    });
  }

  groupAndCachePatientData(immunizationIds: string[], conditionIds: string[]) {
    const grouped: { [patientId: string]: { patient_id: string, conditions: any[], immunizations: any[] } } = {};
    let totalToFetch = immunizationIds.length + conditionIds.length;
    let fetched = 0;
    const finish = () => {
      if (++fetched === totalToFetch) {
        localStorage.setItem(this.GROUPED_CACHE_KEY, JSON.stringify(grouped));
      }
    };
    // Immunizations
    for (const id of immunizationIds) {
      this.patientService.fetchAndDecodeBinary(id).subscribe(records => {
        for (const rec of records) {
          const ref = rec.patient?.reference || '';
          const patientId = ref.replace('Patient/', '');
          if (!grouped[patientId]) grouped[patientId] = { patient_id: patientId, conditions: [], immunizations: [] };
          grouped[patientId].immunizations.push(rec);
        }
        finish();
      });
    }
    // Conditions
    for (const id of conditionIds) {
      this.patientService.fetchAndDecodeBinary(id).subscribe(records => {
        for (const rec of records) {
          const ref = rec.subject?.reference || '';
          const patientId = ref.replace('Patient/', '');
          if (!grouped[patientId]) grouped[patientId] = { patient_id: patientId, conditions: [], immunizations: [] };
          grouped[patientId].conditions.push(rec);
        }
        finish();
      });
    }
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