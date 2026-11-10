/**
 * @familyshield/sdk: the embeddable FamilyShield module.
 *
 *  - mountFamilyShield(el, config): render inside the bank's web or hybrid app
 *  - bootEmbed(options), from "@familyshield/sdk/embed": the page a native app loads in a WebView
 *  - HttpApi: production backend adapter
 *  - createServerMockup() / createBrowserMockup(), from "@familyshield/sdk/mockup": functional-mockup hosts
 */
export { mountFamilyShield, FamilyShieldApp } from './mount';
export type { FamilyShieldConfig, FamilyShieldHandle } from './mount';
export { HttpApi } from './api/http';
export type { HttpApiOptions } from './api/http';
export type { AppConfig, CreateRequestInput, FamilyShieldApi, Profile } from './api/types';
export type { BridgeMessage, HostEvent, HostEventType, InitMessage } from './bridge';
export { defaultTheme } from './theme';
export type { Theme } from './theme';
export type { Role, Route } from './ui/context';
