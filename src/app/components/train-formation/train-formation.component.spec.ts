import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrainFormationComponent } from './train-formation.component';

describe('TrainFormationComponent', () => {
  let component: TrainFormationComponent;
  let fixture: ComponentFixture<TrainFormationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrainFormationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TrainFormationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
