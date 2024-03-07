import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Highlight } from 'ngx-highlightjs';
import { PropertyComponent } from '../property/property.component';
import { TryBoxComponent } from '../try-box/try-box.component';
import {
    DocumentType,
    MethodDocumentType,
    MicroserviceDocumentType
} from '../types/document.type';

@Component({
    selector: 'app-method',
    standalone: true,
    imports: [Highlight, PropertyComponent],
    templateUrl: './method.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MethodComponent {
    method = input.required<MethodDocumentType>();
    microservice = input.required<MicroserviceDocumentType>();
    document = input.required<DocumentType>();
    parameterProperties = computed(() => {
        const document = this.document();
        const paramModel = document.models.find((model) => model.classId === this.method().parameter);
        return paramModel ? paramModel.properties: [];
    });

    responseProperties = computed(() => {
        const document = this.document();
        const responseModel = document.models.find((model) => model.classId === this.method().response);
        return responseModel ? responseModel.properties : [];
    })
    
    modalService = inject(NgbModal);

    tryIt(): void {
        const modalRef = this.modalService.open(TryBoxComponent, { size: 'lg' });
        modalRef.componentInstance.method = this.method();
        modalRef.componentInstance.microservice = this.microservice();
        modalRef.componentInstance.document = this.document();
    }
}
