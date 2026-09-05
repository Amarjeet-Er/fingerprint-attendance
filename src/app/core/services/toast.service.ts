import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  action?: ToastAction;
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastsSubject = new BehaviorSubject<ToastItem[]>([]);
  readonly toasts$: Observable<ToastItem[]> = this.toastsSubject.asObservable();

  get activeToasts(): ToastItem[] {
    return this.toastsSubject.value;
  }

  show(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', action?: ToastAction, duration = 4000): void {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const toast: ToastItem = { id, message, type, action, duration };

    // Keep max 3 toasts at a time
    const updated = [...this.toastsSubject.value.slice(-2), toast];
    this.toastsSubject.next(updated);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }
  }

  success(message: string, action?: ToastAction, duration = 4000): void {
    this.show(message, 'success', action, duration);
  }

  error(message: string, action?: ToastAction, duration = 5000): void {
    this.show(message, 'error', action, duration);
  }

  warning(message: string, action?: ToastAction, duration = 4500): void {
    this.show(message, 'warning', action, duration);
  }

  info(message: string, action?: ToastAction, duration = 4000): void {
    this.show(message, 'info', action, duration);
  }

  dismiss(id: string): void {
    const remaining = this.toastsSubject.value.filter((t) => t.id !== id);
    this.toastsSubject.next(remaining);
  }

  clear(): void {
    this.toastsSubject.next([]);
  }
}
