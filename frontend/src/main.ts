/// <reference types="@angular/localize" />

import { provideHttpClient } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { CodeEditorModule } from '@ngstack/code-editor';
import { HIGHLIGHT_OPTIONS, HighlightModule } from 'ngx-highlightjs';
import { NgxJsonViewerModule } from 'ngx-json-viewer';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
    providers: [
        importProvidersFrom(HighlightModule, CodeEditorModule.forRoot(), NgxJsonViewerModule),
        {
            provide: HIGHLIGHT_OPTIONS,
            useValue: {
                fullLibraryLoader: () => import('highlight.js')
            }
        },
        provideHttpClient(),
        provideRouter(
            [],
            withInMemoryScrolling({
                scrollPositionRestoration: 'enabled',
                anchorScrolling: 'enabled'
            })
        )
    ]
}).catch((err) => console.error(err));
