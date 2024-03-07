import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Highlight } from 'ngx-highlightjs';
import { MicroserviceComponent } from '../microservice/microservice.component';
import { DocumentService } from '../services/document.service';

@Component({
    selector: 'app-document',
    standalone: true,
    imports: [Highlight, MicroserviceComponent],
    templateUrl: './document.component.html',
    styles: `
        :host {
            padding-top: 1rem;
            display: block;
            padding-right: 20px;
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentComponent {
    documents = inject(DocumentService).documents;

    preInstallDescription = `
npm install --save @grpc/grpc-js @grpc/proto-loader

npm install --save @hodfords/nestjs-response @hodfords/nestjs-command
        `.trim();
}
