package com.fh2.rcbridge

import android.app.Application

class Fh2Application : Application() {
    override fun onCreate() {
        super.onCreate()
        DjiSdkRuntime.start(this)
    }
}
