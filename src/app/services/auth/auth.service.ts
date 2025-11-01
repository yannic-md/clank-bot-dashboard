import {Injectable} from '@angular/core';
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import {ActivatedRoute, Router} from "@angular/router";
import {config} from "../../../environments/config";
import {DiscordUser} from "../types/discord/User";
import {DataHolderService} from "../data/data-holder.service";
import {ComService} from "../discord-com/com.service";

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private authUrl: string = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(config.client_id)}&response_type=code&redirect_uri=${encodeURIComponent(config.redirect_url)}&scope=identify+guilds+guilds.members.read`

  constructor(private http: HttpClient, private route: ActivatedRoute, private router: Router,
              private dataService: DataHolderService, private comService: ComService) {}

  /**
   * Authenticates the user with the provided Discord authorization code and state.
   * Sends a POST request to the backend API with the authorization code and state.
   * On successful authentication, stores the access token in local storage,
   * updates the authorization header, and navigates the user to the dashboard.
   * If the state does not match the stored state, navigates to the invalid login error page.
   * If an error occurs during authentication, navigates to the appropriate error page.
   *
   * @param {string} code - The Discord authorization code.
   * @param {string} state - The state parameter to prevent CSRF attacks.
   * @param {boolean} fetch_profile - Whether to fetch the user profile after authentication.
   */
  authenticateUser(code: string, state: string, fetch_profile?: boolean): void {
    // state expiration check
    const stateExpiry: string | null = localStorage.getItem('state_expiry');
    if (!stateExpiry || Date.now() > parseInt(stateExpiry)) {
      this.dataService.redirectLoginError('EXPIRED');
      return;
    }

    // check if the state is the same as the one stored in local storage
    if (state !== atob(localStorage.getItem('state')!)) {
      this.dataService.redirectLoginError('INVALID');
      return;
    }

    this.http.post<any>(`${config.api_url}/auth/discord`, { code: code, state: state }, { withCredentials: true })
      .subscribe({
        next: (_: Object): void => {
          localStorage.removeItem('state');  // clean up stored state
          localStorage.removeItem('state_expiry');

          // remove query parameters from URL
          this.router.navigateByUrl('/dashboard').then((): void => {
            localStorage.setItem("first_login", "true");
            if (fetch_profile) {
              this.getProfileInfo();
            } else {
              this.dataService.isLoginLoading = false;
            }});
        },
        error: (error: HttpErrorResponse): void => {
          if (error.status === 400) {  // code is not valid
            this.dataService.redirectLoginError('INVALID');
          } else if (error.status === 429) {  // ratelimited
            this.dataService.redirectLoginError('BLOCKED');
          } else {
            this.dataService.redirectLoginError('UNKNOWN');
          }
        }
      });
  }

  /**
   * Fetches the authenticated Discord user's profile information from the backend.
   *
   * On success, updates the profile in the DataHolderService.
   * On error, logs out the user and redirects to the appropriate error page based on the HTTP status code.
   */
  private getProfileInfo(): void {
    this.http.get<DiscordUser>(`${config.api_url}/auth/me`, { withCredentials: true }).subscribe({
      next: (response: DiscordUser): void => {
        this.dataService.profile = response;
        this.dataService.isLoginLoading = false;

        this.dataService.getGuilds(this.comService, this);
        setTimeout((): void => { this.dataService.allowDataFetch.next(true); }, 500);
        },
      error: (error: HttpErrorResponse): void => {
        this.logout();

        if (error.status === 401) {
          this.dataService.redirectLoginError('EXPIRED');
        } else if (error.status == 429) {
          this.dataService.redirectLoginError('REQUESTS');
        } else {
          this.dataService.redirectLoginError('UNKNOWN');
        }
      }
    });
  }

  /**
   * Appends a unique state parameter to the authentication URL.
   * The state parameter is used to prevent CSRF attacks during the OAuth2 flow.
   * If a state parameter is already present in local storage, it uses that value.
   * Otherwise, it generates a new random state value and stores it in local storage.
   * The state parameter is then appended to the `authUrl`.
   */
  private appendState(): void {
    const encodedState: string = btoa(this.generateSecureState());
    localStorage.setItem('state', encodedState);
    localStorage.setItem('state_expiry', (Date.now() + 5 * 60 * 1000).toString()); // Add 5min expiry

    this.http.post<void>(`${config.api_url}/auth/saveState`, { state: atob(encodedState) })
      .subscribe({
        next: (): void => {
          // replace state if it already exists in the URL
          const stateRegex = /(&state=[^&]*)/;
          if (this.authUrl.match(stateRegex)) {
            if (!this.authUrl.includes(`state=${atob(encodedState)}`)) {
              this.authUrl = this.authUrl.replace(stateRegex, `&state=${encodeURIComponent(atob(encodedState))}`);
            }
          } else {
            this.authUrl += `&state=${atob(encodedState)}`;
          }
          window.location.href = this.authUrl;
        },
        error: (): void => {
          // Handle state save error
          localStorage.removeItem('state');
          localStorage.removeItem('state_expiry');
          this.dataService.redirectLoginError('UNKNOWN');
        }
      });
  }

  /**
   * Generates a secure random state string for OAuth2 flow.
   * The state parameter is used to prevent CSRF attacks.
   * This function uses the Web Crypto API to generate a cryptographically secure random value.
   *
   * @returns {string} A secure random state string.
   */
  private generateSecureState(): string {
    const array = new Uint8Array(32);
    return Array.from(crypto.getRandomValues(array), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Checks if the user has administrator permissions.
   *
   * This method takes a permission string, converts it to a BigInt, and checks if the
   * administrator permission bit is set. The administrator permission is represented
   * by the bit value `0x00000008`.
   *
   * @param {string} perm_string - The permission string to check.
   * @returns {boolean} `true` if the user has administrator permissions, `false` otherwise.
   */
  isAdmin(perm_string: string): boolean {
    const ADMINISTRATOR_PERMISSION = 0x00000008;
    return (BigInt(perm_string) & BigInt(ADMINISTRATOR_PERMISSION)) !== 0n;
  }

  /**
   * Logs out the user by removing the access token from local storage
   * and navigating to the home page.
   */
  logout(): void {
    this.http.post<any>(`${config.api_url}/auth/logout`, {}, { withCredentials: true })
      .subscribe({
        next: (_: Object): void => {
          // remove query parameters from URL
          localStorage.clear();  // clear all local storage
          this.router.navigateByUrl('/').then();
        },
        error: (error: HttpErrorResponse): void => {
          if (error.status === 400) {  // code is not valid
            this.dataService.redirectLoginError('INVALID');
          } else if (error.status === 429) {  // ratelimited
            this.dataService.redirectLoginError('BLOCKED');
          } else {
            this.dataService.redirectLoginError('UNKNOWN');
          }
        }
      });
  }

  /**
   * Verifies the login by checking the query parameters for a valid login code.
   * If the code is not present, redirects the user to the Discord authentication URL.
   * If the code is present, authenticates the user using the provided code.
   */
  discordLogin(): void {
    this.route.queryParams.subscribe(params => {
      if ((!params['code'] || !params['state']) && !window.location.pathname.includes("errors/")) {
        // redirect to discord if invalid login code
        this.appendState();
        return;
      }

      if (params['code'] && params['state']) {
        this.authenticateUser(params['code'], params['state']);
      }
    });
  }
}
