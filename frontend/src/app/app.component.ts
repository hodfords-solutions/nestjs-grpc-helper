import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { DocumentComponent } from './document/document.component';
import { MenuListComponent } from './menu-list/menu-list.component';
import { DocumentService } from './services/document.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [MenuListComponent, DocumentComponent],
    template: `
        <div class="row">
            <div class="col-3">
                <app-menu-list></app-menu-list>
            </div>
            <div class="col-9">
                <app-document></app-document>
            </div>
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit {
    documentService = inject(DocumentService);
    viewport = inject(ViewportScroller);

    ngOnInit(): void {
        this.documentService.getDocuments();
        this.viewport.setOffset([0, 65]);
    }
}
