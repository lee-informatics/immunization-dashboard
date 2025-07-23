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
}