import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DocumentType } from '../types/document.type';
import { MenuType } from '../types/menu.type';

@Injectable({ providedIn: 'root' })
export class DocumentService {
    public documents = signal<DocumentType[]>([]);
    public menus = signal<MenuType[]>([]);
    public activeId: any;

    http = inject(HttpClient);

    getDocument(host: string = '') {
        this.http.get<DocumentType>(host + 'json').subscribe((response) => {
            response.host = host;
            for (let microservice of response.microservices) {
                microservice.link = `${response.package}_${microservice.name}`;
                for (let method of microservice.methods) {
                    method.link = `${response.package}_${method.name}`;
                }
            }

            this.documents.update((oldDocuments) => [...oldDocuments, response]);
            this.createMenus();
        });
    }

    getDocuments() {
        this.http.get<string[]>('assets/config.json').subscribe({
            next: (response) => {
                if (response.length) {
                    for (let host of response) {
                        this.getDocument(host);
                    }
                } else {
                    this.getDocument();
                }
            },
            error: (error) => {
                this.getDocument();
            }
        });
    }

    createMenus() {
        this.activeId = `${this.documents()[0].package}_${this.documents()[0].title}`;
        this.menus.set(
            this.documents().map((document) => {
                return {
                    name: document.title,
                    link: `${document.package}_${document.title}`,
                    host: document.host,
                    children: document.microservices.map((microservice) => {
                        return {
                            name: microservice.name,
                            link: `${document.package}_${microservice.name}`,
                            children: microservice.methods.map((method) => {
                                return {
                                    name: method.name,
                                    link: `${document.package}_${method.name}`
                                };
                            })
                        };
                    })
                };
            })
        );
    }
}
