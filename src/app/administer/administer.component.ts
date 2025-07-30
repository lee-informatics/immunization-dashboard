import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../service/patient.service';
import { DataApiService } from '../service/data-api.service';
import { HttpClient } from '@angular/common/http';
import { AdministerService } from '../service/administer.service';

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

  adminType: 'immunization' | 'medication' = 'immunization';

  // Validation state
  validationErrors: string[] = [];
  isSubmitting: boolean = false;

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private datePipe: DatePipe, 
    private patientService: PatientService,
    private dataApi: DataApiService,
    private http: HttpClient,
    private administerService: AdministerService
  ) {}

  ngOnInit() {
    window.scrollTo(0, 0);
    this.patientId = this.route.snapshot.paramMap.get('id') || '';
    // Determine type from route
    const url = this.router.url;
    if (url.includes('administer-immunization')) {
      this.adminType = 'immunization';
    } else if (url.includes('administer-medication')) {
      this.adminType = 'medication';
    }
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
            description: medication.description,
            rxnormCode: medication.rxnormCode,
            dosage: medication.dosage
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
      }
    });
    this.dataApi.getPractitioners().subscribe({
      next: (practitioners) => {
        this.practitionerList = (practitioners || [])
          .map((practitioner: any) => ({
            id: practitioner.id,
            name: practitioner.name && practitioner.name[0] ? `${practitioner.name[0].prefix ? practitioner.name[0].prefix.join(' ') + ' ' : ''}${practitioner.name[0].given ? practitioner.name[0].given.join(' ') + ' ' : ''}${practitioner.name[0].family || ''}`.trim() : 'Unknown',
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
      }
    });
  }

  goBack() {
    // Navigate back with a refresh parameter to trigger data refresh
    this.router.navigate(['/patient', this.patientId], { 
      queryParams: { refresh: Date.now() } 
    });
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
    this.clearValidationErrors();
  }

  toggleMedicationSelection(id: string) {
    const index = this.selectedMedications.indexOf(id);
    if (index > -1) {
      this.selectedMedications.splice(index, 1);
    } else {
      this.selectedMedications.push(id);
    }
    this.clearValidationErrors();
  }

  togglePractitionerSelection(id: string) {
    // Single selection - replace current selection
    this.selectedPractitioner = this.selectedPractitioner === id ? '' : id;
    this.clearValidationErrors();
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
    this.clearValidationErrors();
  }

  toggleAllMedications() {
    if (this.selectedMedications.length === this.medicationList.length) {
      this.selectedMedications = [];
    } else {
      this.selectedMedications = this.medicationList.map(med => med.id);
    }
    this.clearValidationErrors();
  }

  toggleAllPractitioners() {
    // For single selection, this doesn't make sense, so we'll clear the selection
    this.selectedPractitioner = '';
    this.clearValidationErrors();
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

  // Validation methods
  clearValidationErrors(): void {
    this.validationErrors = [];
  }

  validateForm(): boolean {
    this.validationErrors = [];

    // Check if patient exists
    if (!this.patient) {
      this.validationErrors.push('Patient information is required.');
    }

    // Check if patient ID is valid
    if (!this.patientId || this.patientId.trim() === '') {
      this.validationErrors.push('Valid patient ID is required.');
    }

    // Check if practitioner is selected
    if (!this.selectedPractitioner || this.selectedPractitioner.trim() === '') {
      this.validationErrors.push('A practitioner must be selected.');
    }

    // Check if at least one item is selected based on admin type
    if (this.adminType === 'immunization') {
      if (this.selectedImmunizations.length === 0) {
        this.validationErrors.push('At least one immunization must be selected.');
      }
    } else if (this.adminType === 'medication') {
      if (this.selectedMedications.length === 0) {
        this.validationErrors.push('At least one medication must be selected.');
      }
    }

    // Check if data is loaded
    if (this.loadingData) {
      this.validationErrors.push('Please wait for data to load before submitting.');
    }

    // Check if practitioner list is available
    if (this.practitionerList.length === 0) {
      this.validationErrors.push('No practitioners available. Please try refreshing the page.');
    }

    // Check if immunization/medication lists are available
    if (this.adminType === 'immunization' && this.immunizationList.length === 0) {
      this.validationErrors.push('No immunizations available. Please try refreshing the page.');
    } else if (this.adminType === 'medication' && this.medicationList.length === 0) {
      this.validationErrors.push('No medications available. Please try refreshing the page.');
    }

    // Validate selected items exist in the lists
    if (this.adminType === 'immunization') {
      for (const immId of this.selectedImmunizations) {
        if (!this.immunizationList.find(imm => imm.id === immId)) {
          this.validationErrors.push(`Selected immunization with ID ${immId} is no longer available.`);
        }
      }
    } else if (this.adminType === 'medication') {
      for (const medId of this.selectedMedications) {
        if (!this.medicationList.find(med => med.id === medId)) {
          this.validationErrors.push(`Selected medication with ID ${medId} is no longer available.`);
        }
      }
    }

    // Validate selected practitioner exists
    if (this.selectedPractitioner && !this.practitionerList.find(prac => prac.id === this.selectedPractitioner)) {
      this.validationErrors.push('Selected practitioner is no longer available.');
    }

    return this.validationErrors.length === 0;
  }

  onSubmit() {
    if (this.isSubmitting) {
      return; // Prevent double submission
    }

    if (!this.validateForm()) {
      // Show validation errors
      this.administerService.showError('Please fix the following errors: ' + this.validationErrors.join(' '));
      return;
    }

    this.isSubmitting = true;

    if (this.adminType === 'immunization') {
      const selectedPractitionerData = this.practitionerList.find(prac => prac.id === this.selectedPractitioner);
      this.administerService.administerImmunizations(
        this.patientId,
        this.selectedImmunizations,
        selectedPractitionerData,
        this.immunizationList
      ).then(() => {
        this.administerService.showSuccess('Immunizations administered successfully!');
        this.isSubmitting = false;
        this.goBack();
      }).catch((err) => {
        this.administerService.showError('Error administering immunizations: ' + (err?.message || err));
        this.isSubmitting = false;
      });
    } else if (this.adminType === 'medication') {
      const selectedPractitionerData = this.practitionerList.find(prac => prac.id === this.selectedPractitioner);
      this.administerService.administerMedications(
        this.patientId,
        this.selectedMedications,
        selectedPractitionerData,
        this.medicationList
      ).then(() => {
        this.administerService.showSuccess('Medications administered successfully!');
        this.isSubmitting = false;
        this.goBack();
      }).catch((err) => {
        this.administerService.showError('Error administering medications: ' + (err?.message || err));
        this.isSubmitting = false;
      });
    } else {
      this.administerService.showSuccess('Administration recorded successfully!');
      this.isSubmitting = false;
      this.goBack();
    }
  }

  // Helper method to check if form is valid for enabling/disabling submit button
  isFormValid(): boolean {
    if (this.loadingData || this.isSubmitting) {
      return false;
    }

    if (!this.patient || !this.patientId || this.selectedPractitioner === '') {
      return false;
    }

    if (this.adminType === 'immunization' && this.selectedImmunizations.length === 0) {
      return false;
    }

    if (this.adminType === 'medication' && this.selectedMedications.length === 0) {
      return false;
    }

    return true;
  }
} 