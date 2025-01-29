import { LightningElement, api, wire } from 'lwc';
import getActionItems from '@salesforce/apex/expeditionController.getActionItems';
import completeExpedition from '@salesforce/apex/expeditionController.completeExpedition';
import getExpeditionData from '@salesforce/apex/expeditionController.getExpeditionData';
import updateExpeditionNotes from '@salesforce/apex/expeditionController.updateExpeditionNotes';
import updateActionFindings from '@salesforce/apex/expeditionController.updateActionFindings';
import updateActionCompletion from '@salesforce/apex/expeditionController.updateActionCompletion';
import uploadPhotoToExpedition from '@salesforce/apex/expeditionController.uploadPhotoToExpedition';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class monitorExpeditionLWC extends LightningElement {
    @api recordId;
    expeditionsMap = new Map();
    expeditions = [];
    actionsByExpedition = {};
    isModalOpen = false;
    isModalOpenFile = false;
    currentExpeditionId;
    notesValue;
    isLoading = false;
    error;
    fileName;
    fileContent;

    @wire(getExpeditionData)
    wiredExpeditions({ error, data }) {
        if (data) {
            this.expeditions = data;
            this.error = undefined;
            this.expeditions.forEach(exp => {
                this.expeditionsMap.set(exp.Id, exp);
            });
            
            if (this.expeditions.length > 0) {
                const expeditionIds = this.expeditions.map(exp => exp.Id);
                this.currentExpeditionId = expeditionIds[0];
                this.loadActions(expeditionIds);
            }
        } else if (error) {
            this.error = error;
            this.expeditions = [];
            console.error('Error fetching expeditions:', error);
        }
    }

    loadActions(expeditionIds) {
        getActionItems({ expeditionIds })
            .then(result => {
                this.actionsByExpedition = result;
            })
            .catch(error => {
                console.error('Error loading actions:', error);
                this.showToastError('Error loading actions');
            });
    }

    get hasExpeditions() {
        return this.expeditions && this.expeditions.length > 0;
    }

    get hasMultipleExpeditions() {
        return this.expeditions.length > 1;
    }

    get currentExpedition() {
        return this.expeditionsMap.get(this.currentExpeditionId);
    }

    get expeditionActions() {
        return this.actionsByExpedition[this.currentExpeditionId] || [];
    }

    get expeditionOptions() {
        return this.expeditions.map(exp => ({
            label: exp.Name,
            value: exp.Id
        }));
    }

    handleExpeditionSelect(event) {
        this.currentExpeditionId = event.target.value;
        this.notesValue = this.currentExpedition.Notes__c;
    }

    handleCheckboxChange(event) {
        const actionId = event.currentTarget.dataset.id;
        const isChecked = event.currentTarget.checked;

        if (isChecked) {
            updateActionCompletion({ actionId: actionId, isCompleted: isChecked })
                .then(() => {
                    const actions = this.actionsByExpedition[this.currentExpeditionId];
                    this.actionsByExpedition[this.currentExpeditionId] = actions.filter(item => item.Id !== actionId);
                    this.showToastSuccess('Action marked as complete!');
                })
                .catch(error => {
                    this.showToastError('Error updating action');
                });
        }
    }

    handleUpdate(event) {
        const actionId = event.currentTarget.dataset.id;
        const findingsInput = this.template.querySelector(`lightning-input[data-id="${actionId}"][data-type="text"]`).value;
        
        if (findingsInput) {
            updateActionFindings({ actionId, findings: findingsInput })
                .then(() => {
                    this.template.querySelector(`lightning-input[data-id="${actionId}"][data-type="text"]`).value = '';
                    this.showToastSuccess('Finding Updated!');
                })
                .catch(error => {
                    this.showToastError('Error updating findings');
                });
        }
    }

    handleExpeditionComplete() {
        if (!this.currentExpeditionId) return;

        const actions = this.actionsByExpedition[this.currentExpeditionId] || [];
        const hasPendingActions = actions.length > 0;
        
        if (hasPendingActions) {
            this.showToastError('Cannot complete expedition. There are pending actions');
            return;
        }

        completeExpedition({ expeditionId: this.currentExpeditionId })
            .then(() => {
                this.expeditions = this.expeditions.filter(exp => exp.Id !== this.currentExpeditionId);
                if (this.expeditions.length > 0) {
                    this.currentExpeditionId = this.expeditions[0].Id;
                }
                this.showToastSuccess('Expedition marked as complete');
            })
            .catch((error) => {
                this.showToastError('Error completing expedition');
            });
    }

    openModal() {
        this.isModalOpen = true;
        this.notesValue = this.currentExpedition.Notes__c;
    }

    closeModal() {
        this.isModalOpen = false;
    }

    handleNotesChange(event) {
        this.notesValue = event.target.value;
    }

    saveNotes() {
        updateExpeditionNotes({ expeditionId: this.currentExpeditionId, notes: this.notesValue })
            .then(() => {
                const updatedExpedition = { 
                    ...this.expeditionsMap.get(this.currentExpeditionId), 
                    Notes__c: this.notesValue 
                };
                this.expeditionsMap.set(this.currentExpeditionId, updatedExpedition);
                this.showToastSuccess('Notes updated successfully!');
                this.closeModal();
            })
            .catch(error => {
                console.log(error);
                this.showToastError('Error updating notes');
            });
        
    }

    handleImportPhotos() {
        this.isModalOpenFile = true;
    }

    closeModalFile() {
        this.isModalOpenFile = false;
        this.fileName = null;
        this.fileContent = null;
    }

    handleFileChange(event) {
        const file = event.target.files[0];
        if (file) {
            this.fileName = file.name;
            const reader = new FileReader();
            reader.onload = () => {
                this.fileContent = reader.result.split(',')[1];
            };
            reader.readAsDataURL(file);
        }
    }

    uploadPhoto() {
        if (!this.fileName || !this.fileContent) {
            this.showToastError('Please select a photo to upload.');
            return;
        }

        this.isLoading = true;
        uploadPhotoToExpedition({
            expeditionId: this.currentExpeditionId,
            fileName: this.fileName,
            fileContent: this.fileContent
        })
            .then(() => {
                this.showToastSuccess('Photo uploaded successfully.');
                this.closeModalFile();
            })
            .catch((error) => {
                this.showToastError('Photo upload failed.');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    showToastError(message) {
        const event = new ShowToastEvent({
            title: 'Error',
            message: message,
            variant: 'error',
        });
        this.dispatchEvent(event);
    }

    showToastSuccess(message) {
        const event = new ShowToastEvent({
            title: 'Success',
            message: message,
            variant: 'success',
        });
        this.dispatchEvent(event);
    }
}