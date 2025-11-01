import {Inject, Injectable, PLATFORM_ID} from '@angular/core';
import {GeneralStats} from "../types/Statistics";
import {Router} from "@angular/router";
import {DiscordUser} from "../types/discord/User";
import {BehaviorSubject, Subject, Subscription} from "rxjs";
import {Channel, Emoji, Guild, initEmojis, Role} from "../types/discord/Guilds";
import {HttpErrorResponse} from "@angular/common/http";
import {SupportTheme, TicketSnippet} from "../types/Tickets";
import {ComService} from "../discord-com/com.service";
import {TranslateService} from "@ngx-translate/core";
import {MarkdownPipe} from "../../pipes/markdown/markdown.pipe";
import {ConvertTimePipe} from "../../pipes/convert-time.pipe";
import {EmbedConfig, EmbedConfigRaw} from "../types/Config";
import {ApiService} from "../api/api.service";
import {SecurityLogs, UnbanRequest} from "../types/Security";
import {isPlatformBrowser} from "@angular/common";
import {AuthService} from "../auth/auth.service";

@Injectable({
  providedIn: 'root'
})
export class DataHolderService {
  isLoading: boolean = true;
  isLoginLoading: boolean = false;

  isEmojisLoading: boolean = true;
  isDarkTheme: boolean = false;
  isFetching: boolean = false;
  isFAQ: boolean = false;
  showSidebarLogo: boolean = false;
  showMobileSidebar: boolean = false;
  showEmojiPicker: boolean = false;
  hideGuildSidebar: boolean = false;
  allowDataFetch: Subject<boolean> = new Subject<boolean>();
  sidebarStateChanged: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  isDisabledSpamBtn: boolean = false;

  // error handler related
  error_title: string = 'ERROR_UNKNOWN_TITLE';
  error_desc: string = 'ERROR_UNKNOWN_DESC';
  error_color: 'red' | 'green' = 'red';
  faq_answer: string = '';
  showAlertBox: boolean = false;

  // api related
  active_guild: Guild | null = null;
  profile: DiscordUser | null = null;
  bot_stats: GeneralStats = { user_count: '28.000', guild_count: 350, giveaway_count: 130, ticket_count: 290,
                              punish_count: 110, global_verified_count: '16.000' };
  readonly initTheme: SupportTheme = { id: "0", name: '', icon: '🌟', desc: '', faq_answer: '', roles: [],
                                    default_roles: [], pending: true, action: 'CREATE' };
  support_themes: SupportTheme[] = [];
  servers: Guild[] = [];
  guild_roles: Role[] = [];
  guild_channels: Channel[] = [];
  guild_emojis: Emoji[] | string[] = [];
  unban_requests: UnbanRequest[] = [];
  filteredRequests: UnbanRequest[] = this.unban_requests;
  has_vip: boolean = false;

  embed_config: EmbedConfig = { color_code: '#706fd3', thumbnail_url: 'https://i.imgur.com/8eajG1v.gif',
    banner_url: null, emoji_reaction: this.getEmojibyId('<a:present:873708141085343764>') }
  security_logs: SecurityLogs = {channel_id: null, guild_thread_id: null, bot_thread_id: null, channel_roles_thread_id: null,
    message_thread_id: null, emoji_thread_id: null, join_leave_thread_id: null, unban_thread_id: null}
  org_config: EmbedConfig = {...this.embed_config};
  selectedSnippet: TicketSnippet | null = null;

  private markdownPipe: MarkdownPipe | undefined;
  private convertTimePipe: ConvertTimePipe | undefined;

  constructor(@Inject(PLATFORM_ID) private platformId: Object, private router: Router, private translate: TranslateService) {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeFromLocalStorage();
    }
  }

  /**
   * Initializes the active guild state from localStorage.
   *
   * Loads the active guild from localStorage if available and sets the sidebar logo visibility.
   * This method should be called during service initialization to restore persisted state.
   */
  private initializeFromLocalStorage(): void {
    const temp_guild: string | null = localStorage.getItem('active_guild');
    if (temp_guild) {
      this.showSidebarLogo = true;
      this.active_guild = JSON.parse(temp_guild) as Guild;
    }
  }

  /**
   * Fetches the list of guilds (servers) from the Discord API and updates the local storage.
   *
   * If the guilds are already stored in local storage and were updated within the last 10 minutes,
   * the cached guilds are used instead of making a new API request.
   *
   * The function filters the guilds to include only those where the user has administrator permissions
   * or is the owner, and the guild has the "COMMUNITY" feature. It also formats the member and presence
   * counts for display and sorts the guilds by name.
   *
   * If the API request fails, the user is redirected to the login error page.
   *
   * @param comService - The service used to communicate with the Discord API.
   * @param authService - The service used to check user permissions and roles.
   * @param cache_btn - Optional button element to indicate that the cache is being used (default: `undefined`).
   *
   */
  getGuilds(comService: ComService, authService: AuthService, cache_btn?: HTMLButtonElement): void {
    this.isFetching = true;
    if (cache_btn) { this.isLoading = true; cache_btn.disabled = true; }

    // check if guilds are already stored in local storage
    if (localStorage.getItem('guilds') && localStorage.getItem('guilds_last_updated') &&
      Date.now() - Number(localStorage.getItem('guilds_last_updated')) < 600000 && !cache_btn) {
      this.servers = JSON.parse(localStorage.getItem('guilds') as string);
      if (!this.active_guild) { this.isLoading = false; }
      return;
    }

    comService.getGuilds().then((observable) => observable.subscribe({
      next: (guilds: Guild[]): void => {
        this.servers = guilds
          .filter((guild: Guild): boolean =>
            // check if user has admin perms and if guild is public
            (authService.isAdmin(guild.permissions) || guild.owner) && guild.features.includes("COMMUNITY"))
          .map((guild: Guild): Guild => {
            if (guild.icon !== null) {  // add image url if guild has an icon
              guild.image_url = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}${guild.icon.startsWith('a_') ? '.gif' : '.png'}`;
            }

            // format thousand approximate_member_count with dot
            guild.approximate_member_count = new Intl.NumberFormat('de-DE').format(Number(guild.approximate_member_count));
            guild.approximate_presence_count = new Intl.NumberFormat('de-DE').format(Number(guild.approximate_presence_count));

            return guild;
          }).sort((a: Guild, b: Guild): number => a.name.localeCompare(b.name));  // filter guilds based on name

        localStorage.setItem('guilds', JSON.stringify(this.servers));
        localStorage.setItem('guilds_last_updated', Date.now().toString());
        if (!this.active_guild || cache_btn) {
          this.isLoading = false;
          if (cache_btn) { setTimeout((): void => { cache_btn.disabled = false }, 10000); }
        }
        this.isFetching = false;
      },
      error: (err: HttpErrorResponse): void => {
        if (err.status === 429) {
          this.redirectLoginError('REQUESTS');
          // this.dataService.isLoading = false;
        } else if (err.status === 401) {
          // do nothing because header is weird af
        } else {
          this.redirectLoginError('EXPIRED');
          // this.dataService.isLoading = false;
        }

        this.isFetching = false;
        if (cache_btn) { this.isLoading = false; setTimeout((): void => { cache_btn.disabled = false }, 10000); }
      }
    }));
  }

  /**
   * Fetches the roles of the active guild from the Discord API.
   *
   * This method checks if the roles are cached in local storage and uses the cache
   * if it is valid (less than one minute old). If the cache is invalid or `no_cache`
   * is set to `true`, it fetches the roles from the API and updates the cache.
   *
   * @param discordService - The service used to communicate with the Discord API.
   * @param loading - Optional flag to indicate if the loading state should be set (default: `true`).
   * @param no_cache - Optional flag to bypass the cache and fetch fresh data (default: `false`).
   */
  getGuildRoles(discordService: ComService, loading?: boolean, no_cache?: boolean): void {
    if (!this.active_guild || this.isFetching) { return; }
    if (loading) { this.isFetching = true; }

    // check if guilds are already stored in local storage (5 minute cache)
    if ((localStorage.getItem('guild_roles') && localStorage.getItem('guild_roles_timestamp') &&
      Date.now() - Number(localStorage.getItem('guild_roles_timestamp')) < 300000) && !no_cache) {
      this.guild_roles = JSON.parse(localStorage.getItem('guild_roles') as string) as Role[];
      if (loading) { this.isFetching = false; }
      return;
    }

    discordService.getGuildRoles(this.active_guild.id).then((observable) => {
      const subscription: Subscription = observable.subscribe({
        next: (response: Role[]): void => {
          this.guild_roles = response;
          if (loading) { this.isFetching = false; }

          localStorage.setItem('guild_roles', JSON.stringify(this.guild_roles));
          localStorage.setItem('guild_roles_timestamp', Date.now().toString());
          subscription.unsubscribe();
        },
        error: (err: HttpErrorResponse): void => {
          this.handleApiError(err);
          subscription.unsubscribe();
        }
      });
    });
  }

  /**
   * Fetches the channels of the active guild from the Discord API.
   *
   * This method checks if the channels are cached in local storage and uses the cache
   * if it is valid (less than 5m old). If the cache is invalid or `no_cache`
   * is set to `true`, it fetches the channels from the API and updates the cache.
   *
   * @param discordService - The service used to communicate with the Discord API.
   * @param no_cache - Optional flag to bypass the cache and fetch fresh data (default: `false`).
   * @param loading - Optional flag to indicate if the loading state should be set (default: `true`).
   * @param wish_type - Optional parameter to specify the type of channels to save (default: 'ALL').
   */
  getGuildChannels(discordService: ComService, no_cache?: boolean, loading?: boolean, wish_type?: string): void {
    if (!this.active_guild) { return; }
    this.isFetching = true;

    // check if guilds are already stored in local storage (5m cache)
    if ((localStorage.getItem('guild_channels') && localStorage.getItem('guild_channels_timestamp') &&
      Date.now() - Number(localStorage.getItem('guild_channels_timestamp')) < 300000) && !no_cache) {
      // check if wish type is the same as the one in local storage
      if (wish_type && localStorage.getItem('guild_channels_type') !== wish_type) {
        this.getGuildChannels(discordService, true, loading, wish_type);
        return;
      }

      this.guild_channels = JSON.parse(localStorage.getItem('guild_channels') as string) as Channel[];
      this.isFetching = false;
      if (loading) { this.isLoading = false; }
      return;
    }

    discordService.getGuildChannels(this.active_guild.id).then((observable) => {
      const subscription: Subscription = observable.subscribe({
        next: (response: Channel[]): void => {
          this.guild_channels = response;

          if (wish_type && wish_type !== 'ALL') {
            this.guild_channels = this.guild_channels.filter((channel: Channel) =>
              channel.type === (wish_type === 'TEXT' ? 0 : wish_type === 'FORUM' ? 15 : 2));
          }

          this.isFetching = false;
          if (loading) { this.isLoading = false; }

          localStorage.setItem('guild_channels', JSON.stringify(this.guild_channels));
          localStorage.setItem('guild_channels_type', wish_type ? wish_type : "ALL");
          localStorage.setItem('guild_channels_timestamp', Date.now().toString());
          subscription.unsubscribe();
        },
        error: (err: HttpErrorResponse): void => {
          this.handleApiError(err);
          subscription.unsubscribe();
        }
      });
    });
  }

  /**
   * Fetches the emojis for the current guild, using a 5-minute cache.
   *
   * If the emojis are already cached in localStorage and the cache is still valid (less than 5 minutes old),
   * the cached emojis are loaded. Otherwise, the emojis are fetched from the server.
   *
   * @param {ComService} comService - The service used to communicate with the Discord API.
   * @param {boolean} [no_cache] - Optional flag to force bypassing the cache and fetch fresh data.
   */
  getGuildEmojis(comService: ComService, no_cache?: boolean): void {
    if (!this.active_guild) { return; }
    this.isEmojisLoading = true;

    // check if guilds are already stored in local storage (5 minute cache)
    if ((localStorage.getItem('guild_emojis') && localStorage.getItem('guild_emojis_timestamp') &&
      Date.now() - Number(localStorage.getItem('guild_emojis_timestamp')) < 300000) && !no_cache) {
      this.guild_emojis = JSON.parse(localStorage.getItem('guild_emojis') as string);
      if (this.guild_emojis.length === 0) {
        this.guild_emojis = initEmojis;
      }

      this.isEmojisLoading = false;
      this.isLoading = false;
      return;
    }

    let subscription: Subscription | null = null;
    comService.getGuildEmojis(this.active_guild.id).then((observable) => {
      subscription = observable.subscribe({
        next: (response: Emoji[]): void => {
          this.guild_emojis = response;
          if (this.guild_emojis.length === 0) {
            this.guild_emojis = initEmojis;
          }

          this.isEmojisLoading = false;
          localStorage.setItem('guild_emojis', JSON.stringify(this.guild_emojis));
          localStorage.setItem('guild_emojis_timestamp', Date.now().toString());
          if (subscription) { subscription.unsubscribe(); }
        },
        error: (err: HttpErrorResponse): void => {
          if (subscription) { subscription.unsubscribe(); }
          if (err.status === 429) {
            this.redirectLoginError('REQUESTS');
          } else if (err.status === 401) {
            this.redirectLoginError('NO_CLANK');
          } else {
            this.redirectLoginError('EXPIRED');
          }
        }
      });
    });
  }

  /**
   * Retrieves the event embed configuration for the current guild.
   *
   * This method first checks if a valid configuration is available in localStorage (cached for 30 seconds).
   * If so, it loads the configuration from the cache. Otherwise, it fetches the configuration from the API,
   * updates the local cache, and handles loading states. Handles HTTP errors by redirecting to appropriate error pages.
   *
   * @param {ApiService} apiService - The service used to communicate with the API.
   * @param {ComService} comService - Another service used to communicate with the API.
   * @param {boolean} [no_cache] - If true, ignores the cache and fetches fresh data from the API.
   * @returns {void}
   */
  getEventConfig(apiService: ApiService, comService: ComService, no_cache?: boolean): void {
    if (!this.active_guild) { return; }
    this.isFetching = true;

    // check if guilds are already stored in local storage (30 seconds cache)
    if ((localStorage.getItem('gift_config') && localStorage.getItem('gift_config_timestamp') &&
      localStorage.getItem('guild_vip') &&
      Date.now() - Number(localStorage.getItem('gift_config_timestamp')) < 30000 && !no_cache)) {
      this.embed_config = JSON.parse(localStorage.getItem('gift_config') as string);
      this.has_vip = localStorage.getItem('guild_vip') === 'true';
      if (typeof this.embed_config.color_code === 'number') {
        this.embed_config.color_code = `#${this.embed_config.color_code.toString(16).padStart(6, '0')}`;
      }

      this.org_config = { ...this.embed_config };
      setTimeout((): void => { this.getGuildEmojis(comService, no_cache) }, 100);
      this.isLoading = false;
      this.isFetching = false;
      return;
    }

    const sub: Subscription = apiService.getEventConfig(this.active_guild!.id)
      .subscribe({
        next: (response: EmbedConfigRaw): void => {
          if (typeof response.config.color_code === 'number') {
            response.config.color_code = `#${response.config.color_code.toString(16).padStart(6, '0')}`;
          }

          this.embed_config = response.config;
          this.has_vip = response.has_vip || false;
          this.org_config = { ...response.config };
          this.isLoading = false;
          this.isFetching = false;

          setTimeout((): void => { this.getGuildEmojis(comService, no_cache) }, 550);
          localStorage.setItem('gift_config', JSON.stringify(this.embed_config));
          localStorage.setItem('guild_vip', this.has_vip.toString());
          localStorage.setItem('gift_config_timestamp', Date.now().toString());
          sub.unsubscribe();
        },
        error: (err: HttpErrorResponse): void => {
          this.isLoading = false;
          this.isFetching = false;

          if (err.status === 429) {
            this.redirectLoginError('REQUESTS');
            return;
          } else if (err.status === 0) {
            this.redirectLoginError('OFFLINE');
            return;
          } else {
            this.redirectLoginError('UNKNOWN');
          }
          sub.unsubscribe();
        }
      });
  }

  /**
   * Fetches the security log configuration for the current guild.
   *
   * This method first checks if a valid configuration is available in localStorage (cached for 30 seconds).
   * If so, it loads the configuration from the cache. Otherwise, it fetches the configuration from the API,
   * updates the local cache, and handles loading states. Handles HTTP errors by redirecting to appropriate error pages.
   *
   * @param apiService - The service used to communicate with the API.
   * @param check_unban - If true, checks for unban requests after fetching security logs.
   * @param no_cache - If true, ignores the cache and fetches fresh data from the API.
   * @returns void
   */
  getSecurityLogs(apiService: ApiService, check_unban?: boolean, no_cache?: boolean): void {
    if (!this.active_guild) { return; }
    this.isFetching = true;

    // check if guilds are already stored in local storage (30 seconds cache)
    if ((localStorage.getItem('security_logs') && localStorage.getItem('security_logs_timestamp') &&
      Date.now() - Number(localStorage.getItem('security_logs_timestamp')) < 30000 && !no_cache)) {
      this.security_logs = JSON.parse(localStorage.getItem('security_logs') as string);
      if (localStorage.getItem('security_logs_type') !== 'DEFAULT') {
        this.getSecurityLogs(apiService, check_unban, true);  // check if cached logs has the correct type
        return;
      }

      if (check_unban) {
        setTimeout((): void => { this.getUnbanRequests(apiService, no_cache) }, 100);
        return;
      }

      this.isLoading = false;
      this.isFetching = false;
      return;
    }

    const sub: Subscription = apiService.getSecurityLogs(this.active_guild!.id)
      .subscribe({
        next: (config: SecurityLogs): void => {
          this.security_logs = config;

          if (check_unban) {
            setTimeout((): void => { this.getUnbanRequests(apiService, no_cache) }, 550);
          } else {
            this.isLoading = false;
            this.isFetching = false;
          }

          localStorage.setItem('security_logs', JSON.stringify(this.security_logs));
          localStorage.setItem('security_logs_type', 'DEFAULT');
          localStorage.setItem('security_logs_timestamp', Date.now().toString());
          sub.unsubscribe();
        },
        error: (err: HttpErrorResponse): void => {
          this.isLoading = false;
          this.isFetching = false;

          if (err.status === 429) {
            this.redirectLoginError('REQUESTS');
            return;
          } else if (err.status === 0) {
            this.redirectLoginError('OFFLINE');
            return;
          } else {
            this.redirectLoginError('UNKNOWN');
          }
          sub.unsubscribe();
        }
      });
  }

  /**
   * Fetches unban requests for the current guild, using a 15-second cache.
   *
   * If cached unban requests exist and are not older than 15 seconds (unless `no_cache` is true),
   * loads them from localStorage. Otherwise, fetches fresh data from the API and updates the cache.
   * Handles HTTP errors by redirecting to appropriate error pages.
   *
   * @param apiService - Service for API communication.
   * @param no_cache - If true, bypasses the cache and fetches fresh data.
   * @returns void
   */
  getUnbanRequests(apiService: ApiService, no_cache?: boolean): void {
    if (!this.active_guild) { return; }

    // check if guilds are already stored in local storage (15 seconds cache)
    if ((localStorage.getItem('unban_requests') && localStorage.getItem('unban_requests_timestamp') &&
      Date.now() - Number(localStorage.getItem('unban_requests_timestamp')) < 15000 && !no_cache)) {
      this.unban_requests = JSON.parse(localStorage.getItem('unban_requests') as string);
      this.filteredRequests = this.unban_requests;
      this.isLoading = false;
      this.isFetching = false;
      return;
    }

    const sub: Subscription = apiService.getUnbanRequests(this.active_guild!.id)
      .subscribe({
        next: (requests: UnbanRequest[]): void => {
          this.unban_requests = requests;
          this.filteredRequests = this.unban_requests;
          this.isLoading = false;
          this.isFetching = false;

          localStorage.setItem('unban_requests', JSON.stringify(this.unban_requests));
          localStorage.setItem('unban_requests_timestamp', Date.now().toString());
          sub.unsubscribe();
        },
        error: (err: HttpErrorResponse): void => {
          this.isLoading = false;
          this.isFetching = false;

          if (err.status === 429) {
            this.redirectLoginError('REQUESTS');
            return;
          } else if (err.status === 0) {
            this.redirectLoginError('OFFLINE');
            return;
          } else {
            this.redirectLoginError('UNKNOWN');
          }
          sub.unsubscribe();
        }
      });
  }

  /**
   * Extracts the emoji ID from a Discord emoji string and returns the corresponding CDN URL.
   * Discord emojis are formatted as `<:name:id>` for standard emojis or `<a:name:id>` for animated emojis.
   *
   * @param emoji - The Discord emoji string format (e.g., '<:emojiname:123456789>' or '<a:emojiname:123456789>')
   * @param isID - Optional boolean to indicate if the input is the ID of the emoji (default: false)
   * @param isAnimated - Optional boolean to indicate if the emoji is animated (default: false)
   * @param emoji_name - Optional string indicating to return the entire emoji string instead of the CDN URL (default: false)
   * @returns The CDN URL for the emoji, or an empty string if the emoji format is invalid
   */
  getEmojibyId(emoji: string, isID?: boolean, isAnimated?: boolean, emoji_name?: string): string {
    if (!emoji) { return emoji; }
    if (isID) { return `https://cdn.discordapp.com/emojis/${emoji}.${isAnimated ? 'gif' : 'png'}`; }
    if (emoji_name) { return `<${isAnimated ? 'a' : ''}:${emoji_name}:${emoji}>`; }

    // Match emoji format <:name:id> or <a:name:id>
    const match: RegExpMatchArray | null = emoji.match(/<(a?):(\w+):(\d+)>/);
    if (!match) return emoji;

    const emojiId: string = match[3];
    const fileType: 'gif' | 'png' = match[1] === 'a' ? 'gif' : 'png';
    return `https://cdn.discordapp.com/emojis/${emojiId}.${fileType}`;
  }

  /**
   * Updates the combined roles for each support theme by merging default roles and theme-specific roles.
   *
   * Each role in the combined list is marked with `_isFromDefault` to indicate whether it is a default mention role or specific to the theme.
   * This is used for display and logic purposes in the UI.
   *
   * @param themes - Array of support themes to update.
   * @param default_roles - Array of default roles to be included in each theme.
   * @returns The updated array of support themes with combined roles.
   */
  updatePingRoles(themes: SupportTheme[], default_roles: Role[]): SupportTheme[] {
    themes.forEach((theme: SupportTheme): void => {
      const standardRoles = default_roles.map(role => ({
        ...role, _isFromDefault: true }));  // add mark for default ping roles

      const themeRoles = theme.roles.map(role => ({
        ...role, _isFromDefault: false }));  // add mark for theme-specific ping roles

      theme.combined_roles = [...standardRoles, ...themeRoles];
    });

    return themes;
  }

  /**
   * Updates the Discord embed preview element and returns a formatted value for a given giveaway requirement.
   *
   * This function sets the content of the preview element (`req_element`) based on the requirement type (e.g., message count, voice time, membership duration, server, role, custom value, or Nitro restriction).
   * It also returns a formatted string or value for further processing or display.
   *
   * @param value - The requirement string to process (e.g., 'MSG: 10', 'VOICE: 3600', 'SERVER: xyz', etc.).
   * @returns The formatted value for the requirement, or an empty string if the input is invalid or not recognized.
   */
  getGWRequirementValue(value: string | null): string {
    if (!value || value === '') { return ''; }
    const reqElement: HTMLSpanElement = document.getElementById('req_element') as HTMLSpanElement;
    const req_value: string = value.split(': ')[1];
    this.markdownPipe = this.markdownPipe || new MarkdownPipe();
    this.convertTimePipe = this.convertTimePipe || new ConvertTimePipe();

    switch (true) {
      case value.startsWith('MSG: '):
        reqElement.innerHTML = this.markdownPipe.transform(
          this.translate.instant('PLACEHOLDER_GIVEAWAY_EMBED_REQUIREMENTS_MSG', { count: req_value }))
        return req_value;

      case value.startsWith('VOICE: '):
        const voiceTime: string = this.convertTimePipe.transform(Number(req_value), this.translate.currentLang);
        reqElement.innerHTML = this.markdownPipe.transform(
          this.translate.instant('PLACEHOLDER_GIVEAWAY_EMBED_REQUIREMENTS_VOICE', { voicetime: voiceTime }));
        return this.convertTimePipe.convertToFormattedTime(Number(req_value));

      case value.startsWith('MITGLIED: '):
        const memberSince: string = this.convertTimePipe.transform(Number(req_value), this.translate.currentLang);
        reqElement.innerHTML = this.markdownPipe.transform(
          this.translate.instant('PLACEHOLDER_GIVEAWAY_EMBED_REQUIREMENTS_MEMBER', { membership: memberSince }));
        return this.convertTimePipe.convertToFormattedTime(Number(req_value));

      case value.startsWith('SERVER: '):
        const server_url: string = req_value.split(' - ')[0];
        reqElement.innerHTML = this.markdownPipe.transform(
          this.translate.instant('PLACEHOLDER_GIVEAWAY_EMBED_REQUIREMENTS_SERVER',
            { server: server_url }));
        return server_url;

      case value.startsWith('ROLE_ID: '):
        reqElement.innerHTML = this.translate.instant('PLACEHOLDER_GIVEAWAY_EMBED_REQUIREMENTS_ROLE');
        return req_value;

      case value.startsWith('OWN: '):
        reqElement.innerHTML = this.markdownPipe.transform(req_value)
        return req_value;

      case value === 'no_nitro':
        reqElement.innerHTML = this.translate.instant('PLACEHOLDER_GIVEAWAY_EMBED_REQUIREMENTS_NITRO');
        return value;

      default:
        reqElement.innerHTML = '';
        return '';
    }
  }

  /**
   * Redirects the user to a simple error page with a specific error type.
   *
   * This method sets the error title and description based on the provided error type
   * and navigates the user to the `/errors/simple` page.
   *
   * @param {'LOGIN_INVALID' | 'LOGIN_EXPIRED' | 'LOGIN_BLOCKED' | 'UNKNOWN' | 'FORBIDDEN' | 'REQUESTS' | 'OFFLINE'} type - The type of error to display.
   */
  redirectLoginError(type: 'INVALID' | 'EXPIRED' | 'BLOCKED' | 'UNKNOWN' | 'FORBIDDEN' | 'REQUESTS' | 'OFFLINE' | 'NO_CLANK'): void {
    if (type === 'UNKNOWN' || type === 'OFFLINE') {
      this.error_title = `ERROR_${type}_TITLE`
      this.error_desc = `ERROR_${type}_DESC`
    } else {
      this.error_title = `ERROR_LOGIN_${type}_TITLE`
      this.error_desc = `ERROR_LOGIN_${type}_DESC`

      localStorage.removeItem('active_guild');
      this.active_guild = null;
    }

    if (type === 'NO_CLANK') {
      localStorage.removeItem('active_guild');
      this.active_guild = null;
    }

    this.router.navigateByUrl(`/errors/simple`).then();
  }

  /**
   * Handles API errors by redirecting to appropriate error pages based on the status code.
   *
   * This method checks the status code of the HTTP error response and redirects to specific
   * error pages for forbidden access (403), too many requests (429), and offline status (0).
   * If the error status code does not match any of these, it simply stops the loading state.
   *
   * @param err The HTTP error response object
   */
  handleApiError(err: HttpErrorResponse): void {
    if (err.status === 403) {
      this.redirectLoginError('FORBIDDEN');
      return;
    } else if (err.status === 401) {
      this.redirectLoginError('NO_CLANK');
    } else if (err.status === 429) {
      this.redirectLoginError('REQUESTS');
      return;
    } else if (err.status === 0) {
      this.redirectLoginError('OFFLINE');
      return;
    }

    this.isLoading = false;
  }

  /**
   * Displays an alert box with the specified title and description.
   *
   * This method sets the `error_title` and `error_desc` properties of the `DataHolderService`
   * to the provided title and description, respectively, and then sets the `showAlertBox`
   * property to `true` to display the alert box.
   *
   * @param {string} title - The title of the alert box.
   * @param {string} desc - The description of the alert box.
   */
  showAlert(title: string, desc: string): void {
    if (this.router.url === '/errors/simple') { return; } // do not show alert on error page

    this.error_title = title;
    this.error_desc = desc;
    this.showAlertBox = true;

    setTimeout((): void => { this.showAlertBox = false; }, 5000);
  }

  /**
   * Retrieves the theme preference from local storage or the user's system settings.
   *
   * @returns {boolean} - `true` if the theme is dark, otherwise `false`.
   */
  getThemeFromLocalStorage(): boolean {
    const darkMode: string | null = localStorage.getItem('dark');
    if (darkMode !== null) {
      return darkMode === 'true';
    }

    // check user's system theme
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  /**
   * Toggles the theme between light and dark mode.
   */
  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    localStorage.setItem('dark', this.isDarkTheme.toString());
    this.applyTheme();
  }

  /**
   * Applies the current theme to the document
   */
  applyTheme(): void {
    const html: HTMLHtmlElement = document.querySelector('html') as HTMLHtmlElement;
    if (html) {
      if (this.isDarkTheme) {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    }
  }

  /**
   * Toggles the visibility of the mobile sidebar.
   */
  toggleSidebar(): void {
    this.showMobileSidebar = !this.showMobileSidebar;
    if (this.showMobileSidebar) { this.sidebarStateChanged.next(true); }
  }

  /**
   * Type guard to check if a channel is a TextChannel (not a VoiceChannel).
   * Assumes TextChannel has type 'text' and VoiceChannel has type 'voice'.
   */
  isTextChannel(channel: Channel): boolean {
    return 'type' in channel && channel.type === 0;
  }

  /**
   * Type guard to check if a channel is a TextChannel (not a VoiceChannel).
   * Assumes TextChannel has type 'text' and VoiceChannel has type 'voice'.
   */
  isVoiceChannel(channel: Channel): boolean {
    return ('type' in channel && (channel.type === 2 || channel.type === 13)) || ('channel_type' in channel && channel.channel_type === 'voice');
  }

}
