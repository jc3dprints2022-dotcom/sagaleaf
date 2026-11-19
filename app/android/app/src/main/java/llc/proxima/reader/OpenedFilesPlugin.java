package llc.proxima.reader;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

/**
 * Books opened from outside the app: "Open with" from Files or a mail attachment (ACTION_VIEW)
 * and the share sheet (ACTION_SEND / ACTION_SEND_MULTIPLE). The intent filters are in
 * AndroidManifest.xml. The web side (src/app/native.ts) reads each file by fetching the
 * content:// URI through Capacitor's local server, then imports it like any picked file.
 *
 * A file that arrives before the page is listening (cold start) waits in `pending` until
 * the page calls takePending().
 */
@CapacitorPlugin(name = "OpenedFiles")
public class OpenedFilesPlugin extends Plugin {

    private static final String EVENT = "filesOpened";
    private final List<JSObject> pending = new ArrayList<>();

    @Override
    public void load() {
        handle(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        handle(intent);
    }

    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject ret = new JSObject();
        synchronized (pending) {
            ret.put("files", new JSArray(pending));
            pending.clear();
        }
        call.resolve(ret);
    }

    private void handle(Intent intent) {
        if (intent == null) return;
        List<Uri> uris = new ArrayList<>();
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            uris.add(intent.getData());
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri u = streamExtra(intent);
            if (u != null) uris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = streamListExtra(intent);
            if (list != null) uris.addAll(list);
        }
        if (uris.isEmpty()) return;
        // Consumed: don't import again if the activity is recreated (rotation, theme change).
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN));

        List<JSObject> files = new ArrayList<>();
        for (Uri u : uris) {
            if (!"content".equals(u.getScheme())) continue; // file:// URIs can't cross apps on Android 7+
            JSObject f = new JSObject();
            f.put("uri", u.toString());
            f.put("name", displayName(u));
            String type = getContext().getContentResolver().getType(u);
            f.put("type", type != null ? type : intent.getType());
            files.add(f);
        }
        if (files.isEmpty()) return;
        if (hasListeners(EVENT)) {
            JSObject data = new JSObject();
            data.put("files", new JSArray(files));
            notifyListeners(EVENT, data);
        } else {
            synchronized (pending) {
                pending.addAll(files);
            }
        }
    }

    private String displayName(Uri u) {
        if ("content".equals(u.getScheme())) {
            try (Cursor c = getContext().getContentResolver().query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    String name = c.getString(0);
                    if (name != null && !name.isEmpty()) return name;
                }
            } catch (Exception ignored) {
                // Some providers don't answer queries; fall back to the last path segment.
            }
        }
        String last = u.getLastPathSegment();
        return last != null ? last : "book";
    }

    @SuppressWarnings("deprecation")
    private static Uri streamExtra(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        return intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    @SuppressWarnings("deprecation")
    private static ArrayList<Uri> streamListExtra(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
        return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
    }
}
