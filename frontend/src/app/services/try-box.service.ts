import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TryBoxService {
    http = inject(HttpClient);

    tryIt(host: string, data: any) {
        return this.http.post(`${host}test`, data);
    }
}
