import Capacitor
import WebKit

class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // Wait until the web app has checked the route and open surfaces.
        webView?.allowsBackForwardNavigationGestures = false
        bridge?.registerPluginInstance(NavigationGesturesPlugin())
    }
}

@objc(NavigationGesturesPlugin)
public class NavigationGesturesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NavigationGesturesPlugin"
    public let jsName = "NavigationGestures"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise)
    ]

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async { [weak self] in
            guard let webView = self?.bridge?.webView else {
                call.reject("WebView is unavailable")
                return
            }
            webView.allowsBackForwardNavigationGestures = enabled
            call.resolve()
        }
    }
}
