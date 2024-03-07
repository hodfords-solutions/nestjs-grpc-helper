import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
    NgbAccordionBody,
    NgbAccordionButton,
    NgbAccordionCollapse,
    NgbAccordionDirective,
    NgbAccordionHeader,
    NgbAccordionItem
} from '@ng-bootstrap/ng-bootstrap';
import { MethodComponent } from '../method/method.component';
import { DocumentType, MicroserviceDocumentType } from '../types/document.type';

@Component({
    selector: 'app-microservice',
    standalone: true,
    imports: [
        NgbAccordionDirective,
        NgbAccordionItem,
        NgbAccordionHeader,
        NgbAccordionButton,
        NgbAccordionCollapse,
        NgbAccordionBody,
        MethodComponent,
        AsyncPipe
    ],
    templateUrl: './microservice.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MicroserviceComponent {
    microservice = input.required<MicroserviceDocumentType>();
    document = input.required<DocumentType>();
    activeId$ = inject(ActivatedRoute).fragment;
}
