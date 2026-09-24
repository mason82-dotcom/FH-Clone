package com.fh2.rcbridge

import android.app.Application
import android.content.Context

class Fh2Application : Application() {
    override fun attachBaseContext(base: Context?) {
        super.attachBaseContext(base)
        // DJI MSDK V5 keeps API classes behind its bootstrap class loader.
        // This must run before any reference to SDKManager or other MSDK APIs.
        com.cySdkyc.clx.Helper.install(this)
    }

    override fun onCreate() {
        super.onCreate()
        Fh2BridgeClient.initialize(this)
        PairingTransportEvidenceRecorder.initialize()
        DjiSdkRuntime.start(this)
    }
}
