import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgbNav, NgbNavItem, NgbNavLink, NgbNavOutlet } from '@ng-bootstrap/ng-bootstrap';
import { DocumentService } from '../services/document.service';

@Component({
    selector: 'app-menu-list',
    standalone: true,
    imports: [NgbNav, NgbNavItem, NgbNavLink, RouterLink, NgbNavOutlet],
    templateUrl: './menu-list.component.html',
    styleUrls: ['./menu-list.component.scss']
})
export class MenuListComponent {
    public documentService = inject(DocumentService);
    menus = this.documentService.menus;
}
