package ro.codelab.glow;

import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TicketBrightness")
public class TicketBrightnessPlugin extends Plugin {
    private String owner;
    private Float previousBrightness;
    private boolean foreground = true;

    private void boost() {
        if (!foreground || getActivity() == null) return;
        Window window = getActivity().getWindow();
        WindowManager.LayoutParams attributes = window.getAttributes();
        if (previousBrightness == null) previousBrightness = attributes.screenBrightness;
        attributes.screenBrightness = 1f;
        window.setAttributes(attributes);
    }

    private void restore() {
        if (previousBrightness == null || getActivity() == null) return;
        Window window = getActivity().getWindow();
        WindowManager.LayoutParams attributes = window.getAttributes();
        // -1 restores system/automatic brightness, rather than pinning a value.
        attributes.screenBrightness = previousBrightness;
        window.setAttributes(attributes);
        previousBrightness = null;
    }

    @PluginMethod
    public void acquire(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) { call.reject("Missing ticket owner"); return; }
        getActivity().runOnUiThread(() -> {
            owner = id;
            boost();
            JSObject result = new JSObject();
            result.put("active", previousBrightness != null);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void release(PluginCall call) {
        String id = call.getString("id");
        getActivity().runOnUiThread(() -> {
            if (owner != null && owner.equals(id)) {
                owner = null;
                restore();
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnPause() {
        foreground = false;
        restore();
    }

    @Override
    protected void handleOnResume() {
        foreground = true;
        if (owner != null) boost();
    }

    @Override
    protected void handleOnDestroy() {
        owner = null;
        restore();
    }
}
