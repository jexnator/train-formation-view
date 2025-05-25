import { Injectable } from '@angular/core';

/**
 * Central service for scrolling to the anchor point after search form submission
 */
@Injectable({
  providedIn: 'root'
})
export class ScrollService {
  private readonly ANCHOR_POINT = 78;
  private isScrolling = false;
  private scrollQueue: (() => void)[] = [];
  private isUserScrolling = false;
  private userScrollTimeout: any;
  
  constructor() {
    // Listen for user scroll events
    window.addEventListener('wheel', this.handleUserScroll, { passive: true });
    window.addEventListener('touchmove', this.handleUserScroll, { passive: true });
  }
  
  private handleUserScroll = () => {
    this.isUserScrolling = true;
    
    // Clear existing timeout
    if (this.userScrollTimeout) {
      clearTimeout(this.userScrollTimeout);
    }
    
    // Reset after scroll ends
    this.userScrollTimeout = setTimeout(() => {
      this.isUserScrolling = false;
    }, 150);
  };
  
  /**
   * Performs a scroll operation while preventing concurrent scrolls
   * @param operation The scroll operation to perform
   */
  private performScroll(operation: () => void) {
    if (this.isScrolling) {
      this.scrollQueue.push(operation);
      return;
    }
    
    this.isScrolling = true;
    
    // Ensure DOM is ready
    requestAnimationFrame(() => {
      // Get initial state
      const initialScroll = window.scrollY;
      
      // Wait for next frame to ensure measurements are stable
      requestAnimationFrame(() => {
        // Only execute if not user scrolling
        if (!this.isUserScrolling) {
          operation();
        }
        
        // Reset scroll state after animation
        const cleanup = () => {
          this.isScrolling = false;
          
          // Process next scroll operation if any
          if (this.scrollQueue.length > 0 && !this.isUserScrolling) {
            const nextOperation = this.scrollQueue.shift();
            if (nextOperation) this.performScroll(nextOperation);
          }
        };
        
        // Wait for scroll animation to complete
        setTimeout(cleanup, 300);
      });
    });
  }
  
  /**
   * Scrolls an element to the anchor point
   * @param element The element to scroll to
   * @param behavior The scroll behavior (smooth or instant)
   * @param force Whether to force the scroll even during user scrolling
   */
  scrollToAnchor(element: Element, behavior: ScrollBehavior = 'smooth', force = false) {
    this.performScroll(() => {
      if (force || !this.isUserScrolling) {
        const rect = element.getBoundingClientRect();
        const targetPosition = (rect.top + window.scrollY) - this.ANCHOR_POINT;
        
        window.scrollTo({
          top: targetPosition,
          behavior
        });
      }
    });
  }
  
  /**
   * Maintains the anchor point position during stop navigation
   * @param element The element to maintain position for
   */
  maintainAnchorPoint(element: Element) {
    // Always force during stop navigation
    this.scrollToAnchor(element, 'smooth', true);
  }
  
  /**
   * Forces scroll to top instantly
   */
  scrollToTop() {
    this.performScroll(() => {
      window.scrollTo(0, 0);
    });
  }
  
  /**
   * Cleanup event listeners
   */
  destroy() {
    window.removeEventListener('wheel', this.handleUserScroll);
    window.removeEventListener('touchmove', this.handleUserScroll);
    if (this.userScrollTimeout) {
      clearTimeout(this.userScrollTimeout);
    }
  }
} 