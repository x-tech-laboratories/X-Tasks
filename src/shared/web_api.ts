import { SERVED_SETTINGS_METHODS, tasks_bridge } from './bridges'

// ============================================================================
// Web bridge contract
// ============================================================================

// The bridge calls the web server answers, each posted to API_PATH and its name with the arguments as a JSON array.
export const WEB_TASKS_METHODS = tasks_bridge.method_names
export const WEB_SETTINGS_METHODS = SERVED_SETTINGS_METHODS

export type WebMethod = (typeof WEB_TASKS_METHODS)[number] | (typeof WEB_SETTINGS_METHODS)[number]

// Paths relative to the page, so the app also works when a proxy serves it under a folder.
export const API_PATH = 'api/'
export const EVENTS_PATH = 'api/events'

// The header naming which open page made a call, so the server tells every other page about the change but not that one.
export const CLIENT_ID_HEADER = 'x-client-id'

// The first event names the page's client id, and each later one says the data changed.
export const HELLO_EVENT = 'hello'
export const CHANGED_EVENT = 'changed'
