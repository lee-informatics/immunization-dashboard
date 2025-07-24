import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../service/patient.service';
import { DataApiService } from '../service/data-api.service';

@Component({
  selector: 'app-administer',
  templateUrl: './administer.component.html',
  styleUrls: ['./administer.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe]
})
export class AdministerComponent implements OnInit {
  patientId: string = '';
  patient: any = null;
  loadingPatient: boolean = false;

  // Multi-select selections for immunizations and medications
  selectedImmunizations: string[] = [];
  selectedMedications: string[] = [];
  // Single selection for practitioner
  selectedPractitioner: string = '';

  immunizationList: any[] = [];
  medicationList: any[] = [];
  practitionerList: any[] = [];
  loadingData: boolean = true;

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private datePipe: DatePipe, 
    private patientService: PatientService,
    private dataApi: DataApiService
  ) {}

  ngOnInit() {
    window.scrollTo(0, 0);
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
    // Fetch data from backend APIs
    this.loadingData = true;
    this.dataApi.getActiveVaccines().subscribe({
      next: (vaccines) => {
        this.immunizationList = (vaccines || [])
          .filter((vaccine: any) => !vaccine.nonvaccine)
          .map((vaccine: any) => ({
            id: vaccine.cvxCode.toString(),
            name: vaccine.fullName,
            shortDescription: vaccine.shortDescription,
            cvxCode: vaccine.cvxCode
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
        this.loadingData = false;
      },
      error: () => { this.loadingData = false; }
    });
    this.dataApi.getMedications().subscribe({
      next: (medications) => {
        this.medicationList = (medications || [])
          .map((medication: any) => ({
            id: medication.id,
            name: medication.name,
            category: medication.category,
            description: medication.description
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
      }
    });
    this.dataApi.getPractitioners().subscribe({
      next: (practitioners) => {
        this.practitionerList = (practitioners || [])
          .map((practitioner: any) => ({
            id: practitioner.id,
            name: practitioner.name,
            specialty: practitioner.specialty,
            credentials: practitioner.credentials,
            department: practitioner.department
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
      }
    });
  }

  goBack() {
    this.router.navigate(['/patient', this.patientId]);
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

  // Helper methods for multi-select
  toggleImmunizationSelection(id: string) {
    const index = this.selectedImmunizations.indexOf(id);
    if (index > -1) {
      this.selectedImmunizations.splice(index, 1);
    } else {
      this.selectedImmunizations.push(id);
    }
  }

  toggleMedicationSelection(id: string) {
    const index = this.selectedMedications.indexOf(id);
    if (index > -1) {
      this.selectedMedications.splice(index, 1);
    } else {
      this.selectedMedications.push(id);
    }
  }

  togglePractitionerSelection(id: string) {
    // Single selection - replace current selection
    this.selectedPractitioner = this.selectedPractitioner === id ? '' : id;
  }

  isImmunizationSelected(id: string): boolean {
    return this.selectedImmunizations.includes(id);
  }

  isMedicationSelected(id: string): boolean {
    return this.selectedMedications.includes(id);
  }

  isPractitionerSelected(id: string): boolean {
    return this.selectedPractitioner === id;
  }

  // Helper methods for select all functionality
  toggleAllImmunizations() {
    if (this.selectedImmunizations.length === this.immunizationList.length) {
      this.selectedImmunizations = [];
    } else {
      this.selectedImmunizations = this.immunizationList.map(imm => imm.id);
    }
  }

  toggleAllMedications() {
    if (this.selectedMedications.length === this.medicationList.length) {
      this.selectedMedications = [];
    } else {
      this.selectedMedications = this.medicationList.map(med => med.id);
    }
  }

  toggleAllPractitioners() {
    // For single selection, this doesn't make sense, so we'll clear the selection
    this.selectedPractitioner = '';
  }

  // Helper methods for getting names in summary
  getImmunizationName(id: string): string {
    const immunization = this.immunizationList.find(imm => imm.id === id);
    return immunization ? immunization.name : 'Unknown';
  }

  getMedicationName(id: string): string {
    const medication = this.medicationList.find(med => med.id === id);
    return medication ? medication.name : 'Unknown';
  }

  getPractitionerName(id: string): string {
    const practitioner = this.practitionerList.find(prac => prac.id === id);
    return practitioner ? practitioner.name : 'Unknown';
  }

  getSelectedPractitionerName(): string {
    return this.getPractitionerName(this.selectedPractitioner);
  }

  onSubmit() {
    // Handle form submission
    const selectedImmunizationData = this.immunizationList.filter(imm => 
      this.selectedImmunizations.includes(imm.id)
    );
    const selectedMedicationData = this.medicationList.filter(med => 
      this.selectedMedications.includes(med.id)
    );
    const selectedPractitionerData = this.practitionerList.find(prac => 
      prac.id === this.selectedPractitioner
    );
    
    console.log('Administer form submitted:', {
      patientId: this.patientId,
      immunizations: selectedImmunizationData,
      medications: selectedMedicationData,
      practitioner: selectedPractitionerData
    });
    
    // For now, just show an alert and go back
    alert('Administration recorded successfully!');
    this.goBack();
  }
} 