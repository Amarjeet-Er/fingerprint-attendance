import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastItem } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" *ngIf="toasts.length > 0">
      <div
        *ngFor="let toast of toasts; trackBy: trackById"
        class="toast-card"
        [ngClass]="'toast-' + toast.type"
      >
        <div class="toast-icon">
          <span *ngIf="toast.type === 'success'">✓</span>
          <span *ngIf="toast.type === 'error'">✕</span>
          <span *ngIf="toast.type === 'warning'">⚠</span>
          <span *ngIf="toast.type === 'info'">ℹ</span>
        </div>

        <div class="toast-content">
          <p class="toast-message">{{ toast.message }}</p>
        </div>

        <div class="toast-actions">
          <button
            *ngIf="toast.action"
            type="button"
            class="toast-action-btn"
            (click)="triggerAction(toast)"
          >
            {{ toast.action.label }}
          </button>
          <button
            type="button"
            class="toast-close-btn"
            (click)="dismiss(toast.id)"
            aria-label="Close notification"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 420px;
      width: calc(100% - 48px);
      pointer-events: none;
    }

    .toast-card {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      background: rgba(18, 24, 38, 0.95);
      backdrop-filter: blur(12px);
      color: #f1f5f9;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      animation: toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: inherit;
    }

    @keyframes toastSlideIn {
      from {
        transform: translateY(16px) scale(0.96);
        opacity: 0;
      }
      to {
        transform: translateY(0) scale(1);
        opacity: 1;
      }
    }

    .toast-success {
      border-left: 4px solid #10b981;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.96));
    }
    .toast-success .toast-icon {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
    }

    .toast-error {
      border-left: 4px solid #ef4444;
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(15, 23, 42, 0.96));
    }
    .toast-error .toast-icon {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }

    .toast-warning {
      border-left: 4px solid #f59e0b;
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.96));
    }
    .toast-warning .toast-icon {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
    }

    .toast-info {
      border-left: 4px solid #3b82f6;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(15, 23, 42, 0.96));
    }
    .toast-info .toast-icon {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
    }

    .toast-icon {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
    }

    .toast-content {
      flex-grow: 1;
      min-width: 0;
    }

    .toast-message {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.4;
      font-weight: 500;
      word-break: break-word;
    }

    .toast-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .toast-action-btn {
      background: rgba(255, 255, 255, 0.14);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .toast-action-btn:hover {
      background: rgba(255, 255, 255, 0.25);
      border-color: rgba(255, 255, 255, 0.35);
    }

    .toast-close-btn {
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .toast-close-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }
  `]
})
export class ToastComponent {
  private readonly toastService = inject(ToastService);

  get toasts(): ToastItem[] {
    return this.toastService.activeToasts;
  }

  trackById(_index: number, item: ToastItem): string {
    return item.id;
  }

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }

  triggerAction(toast: ToastItem): void {
    if (toast.action) {
      toast.action.run();
      this.dismiss(toast.id);
    }
  }
}
