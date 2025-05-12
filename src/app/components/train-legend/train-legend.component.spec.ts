import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrainLegendComponent } from './train-legend.component';
import { SbbIconModule } from '@sbb-esta/angular/icon';
import { SbbIconTestingModule } from '@sbb-esta/angular/icon/testing';

describe('TrainLegendComponent', () => {
  let component: TrainLegendComponent;
  let fixture: ComponentFixture<TrainLegendComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TrainLegendComponent,
        SbbIconModule,
        SbbIconTestingModule
      ]
    }).compileComponents();
    
    fixture = TestBed.createComponent(TrainLegendComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display legend items', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    
    // Check if legend sections are present
    expect(compiled.querySelector('.legend-section')).toBeTruthy();
    
    // Check if all legend categories are displayed
    expect(compiled.textContent).toContain('Wagon Types & Classes');
    expect(compiled.textContent).toContain('Facilities & Attributes');
    expect(compiled.textContent).toContain('Other Symbols');
  });
}); 