package com.lordcookie.engram

import android.app.job.JobParameters
import android.app.job.JobService

/**
 * Der tägliche Update-Blick als JobScheduler-Job (EngramNotifier). Läuft im Hintergrund,
 * auch wenn die App zu ist; plant danach den nächsten Tag.
 */
class UpdateCheckJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        Thread {
            try {
                EngramNotifier.check(applicationContext)
            } catch (_: Exception) {
                // still — morgen wieder
            }
            jobFinished(params, false)
            // Erst nach jobFinished: einen laufenden Job mit derselben ID neu zu planen, stoppt ihn.
            EngramNotifier.schedule(applicationContext)
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true
}
