import {AfterViewInit, Component, ElementRef, OnDestroy, ViewChild} from '@angular/core';
import {faChevronRight, faRefresh} from "@fortawesome/free-solid-svg-icons";
import {FaIconComponent} from "@fortawesome/angular-fontawesome";
import {NgClass, NgOptimizedImage} from "@angular/common";
import {Router, RouterLink} from "@angular/router";
import {IconDefinition} from "@fortawesome/free-solid-svg-icons";
import {AuthService} from "../../services/auth/auth.service";
import {DataHolderService} from "../../services/data/data-holder.service";
import {animate, state, style, transition, trigger} from "@angular/animations";
import {TranslatePipe} from "@ngx-translate/core";
import {ComService} from "../../services/discord-com/com.service";
import {nav_items, NavigationItem} from "../../services/types/navigation/NavigationItem";
import {Guild} from "../../services/types/discord/Guilds";
import {Subscription} from "rxjs";
import {NgbTooltip} from "@ng-bootstrap/ng-bootstrap";

@Component({
    selector: 'app-sidebar',
  imports: [
    FaIconComponent,
    NgOptimizedImage,
    RouterLink,
    NgClass,
    TranslatePipe,
    NgbTooltip
  ],
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.scss',
    animations: [
        trigger('expandCollapse', [
            state('collapsed', style({
                height: '86px',
                overflow: 'hidden',
                opacity: 1
            })),
            state('expanded', style({
                height: '*',
                overflow: 'hidden',
                opacity: 1
            })),
            transition('expanded => collapsed', [
                style({ height: '*' }),
                animate('300ms cubic-bezier(0.4, 0.0, 0.2, 1)', style({ height: '86px' }))
            ]),
            transition('collapsed => expanded', [
                style({ height: '86px' }),
                animate('300ms cubic-bezier(0.4, 0.0, 0.2, 1)', style({ height: '*' }))
            ])
        ]),
        trigger('rotateChevron', [
            state('down', style({ transform: 'rotate(0deg)' })),
            state('down', style({ transform: 'rotate(90deg)' })),
            transition('right <=> down', [
                animate('300ms ease-in-out')
            ])
        ]),
        trigger('slideAnimation', [
            state('hidden', style({
                transform: 'translateX(-100%)',
                opacity: 0
            })),
            state('visible', style({
                transform: 'translateX(0)',
                opacity: 1
            })),
            transition('hidden => visible', [
                animate('0.3s ease-out')
            ]),
            transition('visible => hidden', [
                animate('0.3s ease-in')
            ])
        ]),
        trigger('slideInLeft', [
            transition(':enter', [
                style({ transform: 'translateX(-100%)' }),
                animate('300ms ease-out', style({ transform: 'translateX(0)' }))
            ]),
            transition(':leave', [
                animate('300ms ease-in', style({ transform: 'translateX(-100%)' }))
            ])
        ])
    ]
})
export class SidebarComponent implements AfterViewInit, OnDestroy {
  protected readonly localStorage: Storage = localStorage;
  protected navigation: NavigationItem[] = nav_items;

  @ViewChild('discordServerPicker') private server_picker!: ElementRef<HTMLDivElement>;

  protected readonly window: Window = window;
  protected expandedGroups: { [key: string]: boolean } = {};
  protected readonly faRefresh: IconDefinition = faRefresh;
  protected readonly faChevronRight: IconDefinition = faChevronRight;
  private subscription: Subscription | null = null;

  constructor(protected authService: AuthService, protected dataService: DataHolderService,
              private discordService: ComService, private router: Router, protected comService: ComService) {
    // initialize navigation pages to allow expanding/collapsing & automatically expand group if the third (or later) page is in that group
    this.navigation.forEach(group => {
      this.expandedGroups[group.category] = group.pages.slice(2).some(page =>
        window.location.href.endsWith(page.redirect_url)
      );
    });
  }

  /**
   * Lifecycle hook that is called when the component is destroyed.
   *
   * Unsubscribes from the sidebar state change subscription to prevent memory leaks.
   */
  ngOnDestroy(): void {
    if (this.subscription) { this.subscription.unsubscribe(); }
  }

  /**
   * Lifecycle hook that is called after the component's view has been fully initialized.
   * Sets up a MutationObserver to monitor changes to the `discordServerPicker` element's style attribute.
   * When the element becomes visible (width > 0), it triggers the `getGuilds` method.
   */
  ngAfterViewInit(): void {
    this.subscription = this.dataService.sidebarStateChanged.subscribe((): void => {
      if ((this.server_picker.nativeElement.style.width > '0' || this.server_picker.nativeElement.style.width === '')
          && this.dataService.showMobileSidebar) {
        // call getGuilds() when server picker is visible only (& login call is done)
        if (!this.dataService.isLoginLoading) {
          setTimeout((): void => { this.dataService.getGuilds(this.discordService, this.authService); }, 25);
        }
      }
    });

    // first time call
    setTimeout((): void => {
      if (this.server_picker.nativeElement.style.width === '' && !this.dataService.isLoginLoading) {
        this.dataService.getGuilds(this.discordService, this.authService);
      }
    }, 25);
  }

  /**
   * Toggles the expansion state of a navigation group.
   *
   * @param category - The category of the navigation group to toggle.
   */
  toggleGroup(category: string): void {
    this.expandedGroups[category] = !this.expandedGroups[category];
  }

  /**
   * Selects a server (guild) and updates the active guild in the data service.
   *
   * If the selected guild is already the active guild, it will be deselected and removed from local storage.
   * Otherwise, the selected guild will be set as the active guild and stored in local storage.
   *
   * @param {Guild} guild - The guild to select or deselect.
   */
  selectServer(guild: Guild): void {
    if (this.dataService.active_guild && this.dataService.active_guild.id === guild.id && !window.location.href.includes("/dashboard/contact")) {
      this.cleanUpStorage(true);
      this.dataService.active_guild = null;
      this.router.navigateByUrl('/dashboard').then();

    } else {
      localStorage.setItem('active_guild', JSON.stringify(guild));
      this.cleanUpStorage();
      this.dataService.active_guild = guild;
      if (!this.server_picker) return;

      if (window.innerWidth > 1025) {
        // hide server picker on desktop
        this.server_picker.nativeElement.style.width = '0';
      } else {
        // hide mobile menu
        this.dataService.showMobileSidebar = false;
      }

      this.dataService.allowDataFetch.next(true);
      this.dataService.showSidebarLogo = !this.dataService.showSidebarLogo;
      this.dataService.showMobileSidebar = false;

      // redirect to server's dashboard if contact page is open
      if (window.location.href.includes("/dashboard/contact")) {
        this.router.navigateByUrl('/dashboard').then();
      }
    }
  }

  /**
   * Removes all keys from localStorage except those considered important.
   *
   * @param {boolean} [remove_guild] - If true, 'active_guild' will also be removed; otherwise, it is preserved.
   */
  private cleanUpStorage(remove_guild?: boolean): void {
    const importantKeys: string[] = ['access_token', 'dark', 'lang', 'guilds', 'guilds_last_updated'];
    if (!remove_guild) { importantKeys.push('active_guild'); }

    const keysToRemove: string[] = Object.keys(localStorage).filter(key => !importantKeys.includes(key));
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
}
