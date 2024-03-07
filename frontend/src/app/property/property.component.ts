import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DocumentType, PropertyDocumentType } from '../types/document.type';

@Component({
    selector: 'app-property',
    standalone: true,
    imports: [NgClass],
    templateUrl: './property.component.html',
    styles: `
        .has-child-property {
            cursor: pointer;
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PropertyComponent {
    property = input.required<PropertyDocumentType>();
    document = input.required<DocumentType>();
    properties = computed(() => {
        const models = this.document().models;
        const typeId = this.property().option.typeId;
        if (typeId) {
            const paramModel = models.find((model) => model.classId === typeId);
            return paramModel?.properties;
        }
        return [];
    })
    isShowDetail = false;

    get propertyDetail() {
        let details: string[] = [];
        if (!this.property().option.required) {
            details.push('optional');
        }
        if (this.property().option.isArray) {
            details.push(`${this.property().option.type}[]`);
        } else {
            details.push(this.property().option.type);
        }

        return details.filter((v) => v).join(', ');
    }

    toggleChildProperty() {
        this.isShowDetail = !this.isShowDetail;
    }
}
