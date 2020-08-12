/**
 * This file is the entry-point for Meteor's server side
 */

import '../lib/main'

// Import all files that register Meteor methods:
import './api/blueprints/api'
import './api/blueprints/http'
import './api/client'
import './api/expectedMediaItems'
import './api/ExternalMessageQueue'
import './api/ingest/debug'
import './api/integration/media-scanner'
import './api/integration/mediaWorkFlows'
import './api/logger'
import './api/manualPlayout'
import './api/peripheralDevice'
import './api/playout/api'
import './api/rundown'
import './api/rundownLayouts'
import './api/rundownNotifications'
import './api/showStyles'
import './api/snapshot'
import './api/studios'
import './api/system'
import './api/testTools'
import './api/userActions'
import './methods'
import './migration/api'
import './migration/databaseMigration'
import './migration/migrations'
import './mockData/rundownData'
import './performanceMonitor'
import './systemStatus/api'

// import all files that calls Meteor.startup:
import './api/rest/rest'
import './api/systemTime/systemTime'
import './Connections'
import './coreSystem'
import './cronjobs'
// import './api/ExternalMessageQueue' // called above
// import './performanceMonitor' // called above

// Setup publications and security:
import './publications/_publications'
import './security/_security'
