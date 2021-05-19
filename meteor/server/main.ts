/**
 * This file is the entry-point for Meteor's server side
 */

import '../lib/main'

// Import all files that register Meteor methods:
import './api/blueprints/api'
import './api/blueprints/http'
import './api/client'
import './api/ingest/expectedMediaItems'
import './api/ExternalMessageQueue'
import './api/ingest/debug'
import './api/integration/expectedPackages'
import './api/integration/media-scanner'
import './api/integration/mediaWorkFlows'
import './api/logger'
import './api/peripheralDevice'
import './api/peripheralDeviceInternal'
import './api/playout/api'
import './api/rundown'
import './api/rundownLayouts'
import './api/rundownNotifications'
import './api/showStyles'
import './api/snapshot'
import './api/studio/api'
import './api/system'
import './api/userActions'
import './methods'
import './migration/api'
import './migration/databaseMigration'
import './migration/migrations'
import './api/playout/debug'
import './performanceMonitor'
import './systemStatus/api'
import './api/user'
import './api/organizations'
import './api/serviceMessages/api'

// import all files that calls Meteor.startup:
import './api/rest/rest'
import './api/systemTime/systemTime'
import './Connections'
import './coreSystem'
import './cronjobs'
import './email'
// import './api/ExternalMessageQueue' // called above
// import './performanceMonitor' // called above

// Setup publications and security:
import './publications/_publications'
import './security/_security'
