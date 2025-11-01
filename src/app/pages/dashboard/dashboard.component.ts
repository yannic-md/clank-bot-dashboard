import {AfterViewChecked, Component, ElementRef, OnDestroy, ViewChild} from '@angular/core';
import {DataHolderService} from "../../services/data/data-holder.service";
import {TranslatePipe} from "@ngx-translate/core";
import {NgClass, NgOptimizedImage} from "@angular/common";
import {FaIconComponent} from "@fortawesome/angular-fontawesome";
import {ApiService} from "../../services/api/api.service";
import { HttpErrorResponse } from "@angular/common/http";
import {SliderItems} from "../../services/types/landing-page/SliderItems";
import {faDiscord} from "@fortawesome/free-brands-svg-icons";
import {faTruckMedical, IconDefinition} from "@fortawesome/free-solid-svg-icons";
import {faChevronRight} from "@fortawesome/free-solid-svg-icons";
import {animate, style, transition, trigger} from "@angular/animations";
import {RouterLink} from "@angular/router";
import {Subscription} from "rxjs";
import {SubTasks, Tasks, tasks, TasksCompletionList} from "../../services/types/Tasks";
import {DashboardLayoutComponent} from "../../structure/dashboard-layout/dashboard-layout.component";
import {faRefresh} from "@fortawesome/free-solid-svg-icons";

@Component({
    selector: 'app-dashboard',
  imports: [NgClass, NgOptimizedImage, TranslatePipe, FaIconComponent, RouterLink, DashboardLayoutComponent],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
    animations: [
        trigger('expandCollapse', [
            transition(':enter', [
                style({ height: 0, opacity: 0, overflow: 'hidden' }),
                animate('300ms ease-out', style({ height: '*', opacity: 1, overflow: 'hidden' }))
            ]),
            transition(':leave', [
                style({ height: '*', opacity: 1, overflow: 'hidden' }),
                animate('300ms ease-out', style({ height: 0, opacity: 0, overflow: 'hidden' }))
            ])
        ])
    ]
})
export class DashboardComponent implements OnDestroy, AfterViewChecked {
  protected servers: SliderItems[] = [];
  protected expandedTasks: number[] = [];
  protected tasks: Tasks[] = tasks;
  private orgTasks: Tasks[] = tasks;
  @ViewChild('dashboardContainer') protected dashboardContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('tasklistDiv') protected tasklistDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('serverlistContainer') protected serverlistContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('serverlistDiv') protected serverlistDiv!: ElementRef<HTMLDivElement>;

  protected readonly localStorage: Storage = localStorage;
  protected readonly Number: NumberConstructor = Number;
  protected readonly Intl = Intl;
  protected readonly window: Window = window;

  protected readonly faDiscord: IconDefinition = faDiscord;
  protected readonly faTruckMedical: IconDefinition = faTruckMedical;
  protected readonly faChevronRight: IconDefinition = faChevronRight;
  protected readonly faRefresh: IconDefinition = faRefresh;
  private startLoading: boolean = false;
  private readonly subscription: Subscription | null = null;
  protected disabledCacheBtn: boolean = false;
  protected dataLoading: { moduleProgress: boolean, guildList: boolean } = { moduleProgress: true, guildList: true };

  constructor(protected dataService: DataHolderService, private apiService: ApiService) {
    document.title = "Dashboard ~ Clank Discord-Bot";
    this.dataService.isLoading = true;
    this.dataService.hideGuildSidebar = false;

    this.getServerData(); // first call to get the server data
    this.subscription = this.dataService.allowDataFetch.subscribe((value: boolean): void => {
      if (value) { // only fetch data if allowed
        this.dataLoading = { moduleProgress: true, guildList: true };
        this.getServerData();
      }
    });
  }

  /**
   * Lifecycle hook that is called when the component is destroyed.
   *
   * This method unsubscribes from all active subscriptions to prevent memory leaks.
   */
  ngOnDestroy(): void {
    if (this.subscription) { this.subscription.unsubscribe(); }
  }

  /**
   * Lifecycle hook that is called after the view has been checked.
   * setTimeout is used to ensure that the loading state is updated after the view has been rendered.
   *
   * It's used to show a loading state for some data related things.
   */
  ngAfterViewChecked(): void {
    if (tasks == this.orgTasks && !this.dataService.isLoading && this.dataLoading.moduleProgress && !this.startLoading) {
      setTimeout((): boolean => this.dataLoading.moduleProgress = false, 0);
    }

    if (this.servers.length > 0 && this.dataLoading.guildList) {
      setTimeout((): boolean => this.dataLoading.guildList = false, 0);
    }
  }

  /**
   * Refreshes the cache by disabling the cache button, setting the loading state,
   * and fetching the server data with the cache ignored. The cache button is re-enabled
   * after 30 seconds.
   */
  refreshCache(): void {
    this.disabledCacheBtn = true;
    this.dataService.isLoading = true;
    this.getServerData(true);

    setTimeout((): void => { this.disabledCacheBtn = false; }, 30000); // 30 seconds
  }

  /**
   * Retrieves the server data for the server list and gets the module completion status.
   * Makes a GET request to the backend API to retrieve the server data.
   *
   * @param no_cache - If `true`, the cache will be ignored and the data will be fetched from the server.
   */
  getServerData(no_cache?: boolean): void {
    if (!this.dataService.active_guild) { return; }
    if (!window.location.href.endsWith('/dashboard')) { return; }
    this.startLoading = true;

    // always refresh cache if user logged in for the first time
    const isFirstLogin: boolean = localStorage.getItem("first_login") !== null;

    let guildUsageSub: Subscription | null = null;
    guildUsageSub = this.apiService.getGuildUsage(100)
      .subscribe({
        next: (guildUsage: SliderItems[]): void => {
          this.servers = guildUsage;
          if (guildUsageSub) { guildUsageSub.unsubscribe(); }

          // Fetch module status after guild usage is loaded
          let moduleStatusSub: Subscription | null = null;
          setTimeout((): void => {
            moduleStatusSub = this.apiService.getModuleStatus(this.dataService.active_guild!.id, isFirstLogin ? true : no_cache)
            .subscribe({
              next: (moduleStatus: TasksCompletionList): void => {
                this.updateTasks(moduleStatus);

                this.dataService.isLoading = false;
                this.startLoading = false;

                if (moduleStatusSub) { moduleStatusSub.unsubscribe(); }
                if (moduleStatus['task_1'].cached) { return; }
                localStorage.setItem('moduleStatus', JSON.stringify(moduleStatus));
                localStorage.setItem('moduleStatusTimestamp', Date.now().toString());
                if (isFirstLogin) { localStorage.removeItem('first_login'); }
              },
              error: (err: HttpErrorResponse): void => {
                if (moduleStatusSub) { moduleStatusSub.unsubscribe(); }
                this.handleError(err);
              }
            });
          }, 500);
        },
        error: (err: HttpErrorResponse): void => {
          if (guildUsageSub) { guildUsageSub.unsubscribe(); }
          this.handleError(err);
        }
      });
  }

  /**
   * Handles HTTP errors that occur during API requests.
   * Redirects the user to the login page with an appropriate error message
   * based on the HTTP status code, and stops the loading state.
   *
   * @param err - The HTTP error response from the failed request.
   */
  private handleError(err: HttpErrorResponse): void {
    if (err.status === 403) {
      this.dataService.redirectLoginError('FORBIDDEN');
    } else if (err.status === 401) {
      this.dataService.redirectLoginError('NO_CLANK');
    } else if (err.status === 429) {
      this.dataService.redirectLoginError('REQUESTS');
    } else if (err.status === 0) {
      this.dataService.redirectLoginError('OFFLINE');
    }

    this.dataService.isLoading = false;
  }

  /**
   * Updates the tasks with their completion status based on the provided module status.
   *
   * @param moduleStatus - The status of the modules, containing information about the completion of tasks and subtasks.
   */
  private updateTasks(moduleStatus: TasksCompletionList): void {
    this.tasks.forEach(task => {
      const status = moduleStatus[`task_${task.id}`];
      if (status) {
        task.finished = status.finished;
        task.subtasks.forEach(subtask => {
          const matchingSubtask = status.subtasks.find(st => st.id === subtask.id.toString());
          if (matchingSubtask) {
            subtask.finished = matchingSubtask.finished;
          }
        });
      }
    });
  }

  /**
   * Toggles the expansion state of a task.
   * If the task is currently expanded, it will be collapsed.
   * If the task is currently collapsed, it will be expanded.
   *
   * @param taskId - The ID of the task to toggle.
   */
  toggleTask(taskId: number): void {
    const index: number = this.expandedTasks.indexOf(taskId);
    if (index === -1) {
      this.expandedTasks.push(taskId);
    } else {
      this.expandedTasks.splice(index, 1);
    }
  }

  /**
   * Checks if the main task (based of the given subtasks) is in progress.
   *
   * @param subtasks - The list of subtasks to check.
   * @returns `true` if any subtask is finished, otherwise `false`.
   */
  isInProgress(subtasks: SubTasks[]): boolean {
    return subtasks.some(subtask => subtask.finished)
  }

  /**
   * Calculates the number of completed tasks.
   * This includes both main tasks and subtasks that are marked as finished.
   *
   * @returns The number of completed tasks.
   */
  get completedTasks(): number {
    return this.tasks.filter(t => t.finished).length +
      this.tasks.flatMap(t => t.subtasks).filter(s => s.finished).length;
  }

  /**
   * Calculates the total number of tasks, including both main tasks and subtasks.
   *
   * @returns The total number of tasks.
   */
  get totalTasks(): number {
    return this.tasks.length + this.tasks.flatMap(t => t.subtasks).length;
  }

  /**
   * TrackBy function for Angular ngFor to optimize rendering of task lists.
   * Returns the unique ID of the task to help Angular identify items efficiently.
   *
   * @param task The task object to track.
   * @returns The unique ID of the task.
   */
  trackByTaskId(task: Tasks): number {
    return task.id;
  }

  /**
   * TrackBy function for Angular ngFor to optimize rendering of subtask lists.
   * Returns the unique ID of the subtask to help Angular identify items efficiently.
   *
   * @param subtask The subtask object to track.
   * @param index The index of the subtask in the list.
   * @returns The unique ID of the subtask, or the index if no ID is present.
   */
  trackBySubtaskId(subtask: any, index: number): number {
    return subtask?.id || index;
  }
}
