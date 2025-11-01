import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';

import { DashboardComponent } from './dashboard.component';
import { provideHttpClientTesting } from "@angular/common/http/testing";
import {ActivatedRoute} from "@angular/router";
import {BehaviorSubject, defer, of} from "rxjs";
import {TranslateModule, TranslateService} from "@ngx-translate/core";
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {DataHolderService} from "../../services/data/data-holder.service";
import {ApiService} from "../../services/api/api.service";
import { HttpErrorResponse, provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import {tasks} from "../../services/types/Tasks";
import {dashboardRoutes} from "./dashboard.routes";
import {AuthGuard} from "../../guards/auth.guard";

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let dataService: DataHolderService;
  let apiService: ApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [DashboardComponent, TranslateModule.forRoot(), BrowserAnimationsModule],
    providers: [{ provide: ActivatedRoute, useValue: { snapshot: {
                    queryParams: { code: 'test_code', state: 'test_state' }
                },
                queryParams: of({ code: 'test_code', state: 'test_state' }) } },
        { provide: DataHolderService, useValue: { redirectLoginError: jest.fn(), allowDataFetch: of(true), servers: [],
                                                  sidebarStateChanged: new BehaviorSubject<boolean>(false)} },
        { provide: ApiService, useValue: { getGuildUsage: jest.fn(), getModuleStatus: jest.fn() } },
        { provide: tasks, useValue: [] },
          provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    dataService = TestBed.inject(DataHolderService);
    apiService = TestBed.inject(ApiService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have all dashboard routes defined correctly', () => {
    expect(dashboardRoutes).toEqual([
      { path: '', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'contact', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'wishlist', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'teamlist', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'support/setup', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'support/themes', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'support/snippets', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'support/blocked-users', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'events/view', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'events/design', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'events/channel-roles', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'security/moderation-requests', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'security/shield', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'security/logs', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'security/automod', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
      { path: 'misc/global-chat', canActivate: [AuthGuard], loadComponent: expect.any(Function) },
    ]);
  });

  it('should lazy load all components in dashboard routes', async () => {
    for (const route of dashboardRoutes) {
      const component = await route.loadComponent!();
      expect(component).toBeDefined();
    }
  });

  it("should disable data loder if data was already loaded", () => {
    component['orgTasks'] = component['tasks'];
    component['dataLoading'] = { moduleProgress: true, guildList: true };
    component['servers'] = [{ image_url: '', guild_name: '', guild_invite: '', member_count: 0 }];

    dataService.isLoading = false;

    jest.useFakeTimers();
    component.ngAfterViewChecked();
    jest.runAllTimers();

    expect(component['dataLoading']).toEqual({ moduleProgress: false, guildList: false });
  });

  it('should update document title and set isLoading to false on language change', () => {
    const translateService = TestBed.inject(TranslateService);

    // Simulate language change event
    translateService.onLangChange.emit();

    // Check if document title is updated
    expect(document.title).toBe("Dashboard ~ Clank Discord-Bot");
  });

  it('should refresh cache and re-enable cache button after 30 seconds', fakeAsync(() => {
    jest.spyOn(component, 'getServerData');
    component.refreshCache();

    expect(component['disabledCacheBtn']).toBe(true);
    expect(component['dataService'].isLoading).toBe(true);
    expect(component.getServerData).toHaveBeenCalledWith(true);

    tick(30000); // Simulate the passage of 30 seconds
    expect(component['disabledCacheBtn']).toBe(false);
  }));

  it('should update tasks with their completion status', () => {
    const moduleStatus = {
      task_1: {
        finished: true,
        guild_id: '1',
        subtasks: [
          { id: '1', finished: true },
          { id: '2', finished: false }
        ]
      },
      task_2: {
        finished: false,
        guild_id: '1',
        subtasks: [
          { id: '3', finished: true }
        ]
      }
    };

    component['tasks'] = [
      { id: 1, finished: false, title: '', subtasks: [
          { id: 1, finished: false, name: '', redirect_url: ''}, { id: 2, finished: false,  name: '',  redirect_url: ''}] },
      { id: 2, finished: false, title: '', subtasks: [{ id: 3, finished: false, name: '', redirect_url: ''}] }
    ];

    component['updateTasks'](moduleStatus);

    expect(component['tasks'][0].finished).toBe(true);
    expect(component['tasks'][0].subtasks[0].finished).toBe(true);
    expect(component['tasks'][0].subtasks[1].finished).toBe(false);
    expect(component['tasks'][1].finished).toBe(false);
    expect(component['tasks'][1].subtasks[0].finished).toBe(true);
  });

  it('should not fetch data if active_guild is missing', () => {
    component['dataService'].active_guild = null;
    const spy = jest.spyOn(apiService, 'getGuildUsage');

    component.getServerData();

    expect(spy).not.toHaveBeenCalled();
  });


  it('should not fetch data if not on /dashboard route', () => {
    component['dataService'].active_guild = { id: 'guild1' } as any;
    window = Object.create(window);
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/not-dashboard' }, writable: true });
    const spy = jest.spyOn(apiService, 'getGuildUsage');

    component.getServerData();

    expect(spy).not.toHaveBeenCalled();
  });

  it('should fetch guild usage and update servers, then fetch module status and update tasks', fakeAsync(() => {
    component['dataService'].active_guild = { id: 'guild1' } as any;
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/dashboard' }, writable: true });

    const mockGuildUsage = [{ id: 1 }] as any;
    const mockModuleStatus = {
      task_1: { finished: true, cached: false, subtasks: [{ id: '1', finished: true }], guild_id: '12344564567' },
    };

    jest.spyOn(apiService, 'getGuildUsage').mockReturnValue(defer(() => Promise.resolve(mockGuildUsage)));
    jest.spyOn(apiService, 'getModuleStatus').mockReturnValue(defer(() => Promise.resolve(mockModuleStatus)));
    jest.spyOn(component as any, 'updateTasks');

    localStorage.setItem('first_login', 'true');
    component.getServerData();
    tick();

    expect(component['servers']).toEqual(mockGuildUsage);
    tick(250);
    expect(apiService.getModuleStatus).toHaveBeenCalledWith('guild1', true);
    expect(component['updateTasks']).toHaveBeenCalledWith(mockModuleStatus);
    expect(component['dataService'].isLoading).toBe(false);
    expect(component['startLoading']).toBe(false);
    expect(localStorage.getItem('moduleStatus')).toBe(JSON.stringify(mockModuleStatus));
    expect(localStorage.getItem('moduleStatusTimestamp')).toBeDefined();
    expect(localStorage.getItem('first_login')).toBeNull();
  }));

  it('should not store moduleStatus if cached is true', fakeAsync(() => {
    component['dataService'].active_guild = { id: 'guild1' } as any;
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/dashboard' }, writable: true });

    const mockGuildUsage = [{ id: 1 }] as any;
    const mockModuleStatus = {
      task_1: { finished: true, cached: true, subtasks: [{ id: '1', finished: true }], guild_id: '12344564567' }
    };

    jest.spyOn(apiService, 'getGuildUsage').mockReturnValue(defer(() => Promise.resolve(mockGuildUsage)));
    jest.spyOn(apiService, 'getModuleStatus').mockReturnValue(defer(() => Promise.resolve(mockModuleStatus)));
    jest.spyOn(component as any, 'updateTasks');
    localStorage.removeItem('moduleStatus');

    component.getServerData();
    tick();
    tick(250);

    expect(localStorage.getItem('moduleStatus')).toBeNull();
  }));

  it('should handle error from getGuildUsage', fakeAsync(() => {
    component['dataService'].active_guild = { id: 'guild1' } as any;
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/dashboard' }, writable: true });

    const error = new HttpErrorResponse({ status: 403 });
    jest.spyOn(apiService, 'getGuildUsage').mockReturnValue(defer(() => Promise.reject(error)));
    const handleErrorSpy = jest.spyOn(component as any, 'handleError');

    component.getServerData();
    tick();

    expect(handleErrorSpy).toHaveBeenCalledWith(error);
  }));

  it('should handle error from getModuleStatus', fakeAsync(() => {
    component['dataService'].active_guild = { id: 'guild1' } as any;
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/dashboard' }, writable: true });

    const mockGuildUsage = [{ id: 1 }] as any;
    const error = new HttpErrorResponse({ status: 401 });

    jest.spyOn(apiService, 'getGuildUsage').mockReturnValue(defer(() => Promise.resolve(mockGuildUsage)));
    jest.spyOn(apiService, 'getModuleStatus').mockReturnValue(defer(() => Promise.reject(error)));
    const handleErrorSpy = jest.spyOn(component as any, 'handleError');

    component.getServerData();
    tick();
    tick(250);

    expect(handleErrorSpy).toHaveBeenCalledWith(error);
  }));

  it('should call redirectLoginError with FORBIDDEN and set isLoading to false for status 403', () => {
    const err = new HttpErrorResponse({ status: 403 });
    jest.spyOn(component['dataService'], 'redirectLoginError');
    component['dataService'].isLoading = true;

    (component as any).handleError(err);

    expect(component['dataService'].redirectLoginError).toHaveBeenCalledWith('FORBIDDEN');
    expect(component['dataService'].isLoading).toBe(false);
  });

  it('should call redirectLoginError with NO_CLANK and set isLoading to false for status 401', () => {
    const err = new HttpErrorResponse({ status: 401 });
    jest.spyOn(component['dataService'], 'redirectLoginError');
    component['dataService'].isLoading = true;

    (component as any).handleError(err);

    expect(component['dataService'].redirectLoginError).toHaveBeenCalledWith('NO_CLANK');
    expect(component['dataService'].isLoading).toBe(false);
  });

  it('should call redirectLoginError with REQUESTS and set isLoading to false for status 429', () => {
    const err = new HttpErrorResponse({ status: 429 });
    jest.spyOn(component['dataService'], 'redirectLoginError');
    component['dataService'].isLoading = true;

    (component as any).handleError(err);

    expect(component['dataService'].redirectLoginError).toHaveBeenCalledWith('REQUESTS');
    expect(component['dataService'].isLoading).toBe(false);
  });

  it('should call redirectLoginError with OFFLINE and set isLoading to false for status 0', () => {
    const err = new HttpErrorResponse({ status: 0 });
    jest.spyOn(component['dataService'], 'redirectLoginError');
    component['dataService'].isLoading = true;

    (component as any).handleError(err);

    expect(component['dataService'].redirectLoginError).toHaveBeenCalledWith('OFFLINE');
    expect(component['dataService'].isLoading).toBe(false);
  });

  it('should only set isLoading to false for unknown status codes', () => {
    const err = new HttpErrorResponse({ status: 500 });
    jest.spyOn(component['dataService'], 'redirectLoginError');
    component['dataService'].isLoading = true;

    (component as any).handleError(err);

    expect(component['dataService'].redirectLoginError).not.toHaveBeenCalled();
    expect(component['dataService'].isLoading).toBe(false);
  });

  it('should toggle the expansion state of a task', () => {
    const taskId = 1;
    component['expandedTasks'] = [];

    // Toggle to expand the task
    component.toggleTask(taskId);
    expect(component['expandedTasks']).toContain(taskId);

    // Toggle to collapse the task
    component.toggleTask(taskId);
    expect(component['expandedTasks']).not.toContain(taskId);
  });

  it('should return true if any subtask is finished', () => {
    const subtasks = [
      { id: 1, finished: false, name: '', redirect_url: '' },
      { id: 2, finished: true, name: '', redirect_url: '' }
    ];

    expect(component.isInProgress(subtasks)).toBe(true);
  });

  it('should calculate the total number of completed tasks correctly', () => {
    component['tasks'] = [
      { id: 1, finished: true, title: '', subtasks: [
          { id: 1, finished: true, name: '', redirect_url: ''}, { id: 2, finished: false,  name: '',  redirect_url: ''}] },
      { id: 2, finished: false, title: '', subtasks: [{ id: 3, finished: true, name: '', redirect_url: ''}] }
    ];

    expect(component.completedTasks).toBe(3);
  });

  it('should calculate the total number of tasks correctly', () => {
    component['tasks'] = [
      { id: 1, finished: false, title: '', subtasks: [
        { id: 1, finished: false, name: '', redirect_url: ''}, { id: 2, finished: false,  name: '',  redirect_url: ''}] },
      { id: 2, finished: true, title: '', subtasks: [{ id: 3, finished: true, name: '', redirect_url: ''}] }
    ];

    expect(component.totalTasks).toBe(5);
  });

  it('should return the correct task id in trackByTaskId', () => {
    const task = { id: 42 } as any;
    expect(component.trackByTaskId(task)).toBe(42);
  });

  it('should return subtask id in trackBySubtaskId if present', () => {
    const subtask = { id: 7 };
    expect(component.trackBySubtaskId(subtask, 3)).toBe(7);
  });

  it('should return index in trackBySubtaskId if subtask id is missing', () => {
    const subtask = {};
    expect(component.trackBySubtaskId(subtask, 5)).toBe(5);
  });
});
