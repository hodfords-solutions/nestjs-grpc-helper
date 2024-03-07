import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { CodeEditorModule, CodeModel } from '@ngstack/code-editor';
import { NgxJsonViewerModule } from 'ngx-json-viewer';
import { TryBoxService } from '../services/try-box.service';
import { DocumentType, MethodDocumentType, MicroserviceDocumentType } from '../types/document.type';

@Component({
    selector: 'app-try-box',
    standalone: true,
    imports: [CodeEditorModule, NgClass, NgxJsonViewerModule],
    templateUrl: './try-box.component.html',
    styles: `
        .parameter-title-error {
            background-color: rgba(159, 63, 63, 0.52);
        }

        .parameter-title {
            margin-left: -16px;
            margin-right: -16px;
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TryBoxComponent {
    @Input() 
    method!: MethodDocumentType;
    
    @Input() 
    microservice!: MicroserviceDocumentType;

    @Input()
    document!: DocumentType;

    isLoading = signal(false);
    response = signal<any>('');
    isError = signal(false);

    theme = 'vs';

    codeModel: CodeModel = {
        language: 'json',
        uri: 'main.json',
        value: '{}'
    };

    options = {
        contextmenu: true,
        minimap: {
            enabled: false
        }
    };

    public activeModal = inject(NgbActiveModal);
    tryBoxService = inject(TryBoxService);

    tryIt() {
        this.isLoading.set(true);
        this.isError.set(false);

        this.tryBoxService
            .tryIt(this.document.host, {
                serviceName: this.microservice.name,
                methodName: this.method.name,
                isFindMany: Boolean(this.method.isResponseArray),
                data: JSON.parse(this.codeModel.value)
            })
            .subscribe({
                next: (data) => {
                    console.log(data);
                    this.response.set(data);
                    this.isLoading.set(false);
                },
                error: (error) => {
                    console.log(error);
                    this.isError.set(true);
                    this.response.set(error);
                    this.isLoading.set(false);
                }
            });
    }
}
