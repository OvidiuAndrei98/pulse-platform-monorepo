import Capacitor
import WebKit
import UIKit

class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // Wait until the web app has checked the route and open surfaces.
        webView?.allowsBackForwardNavigationGestures = false
        bridge?.registerPluginInstance(NavigationGesturesPlugin())
        bridge?.registerPluginInstance(TicketBrightnessPlugin())
    }
}

@objc(TicketBrightnessPlugin)
public class TicketBrightnessPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TicketBrightnessPlugin"
    public let jsName = "TicketBrightness"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "acquire", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "release", returnType: CAPPluginReturnPromise)
    ]
    private var owner: String?
    private var previousBrightness: CGFloat?
    private var screen: UIScreen?
    private var observers: [NSObjectProtocol] = []

    public override func load() {
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.restore()
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            if self?.owner != nil { self?.boost() }
        })
    }

    private func boost() {
        guard UIApplication.shared.applicationState == .active else { return }
        if previousBrightness == nil {
            let target = bridge?.webView?.window?.windowScene?.screen ?? UIScreen.main
            screen = target
            previousBrightness = target.brightness
        }
        screen?.brightness = 1
    }

    private func restore() {
        if let previous = previousBrightness { screen?.brightness = previous }
        previousBrightness = nil
        screen = nil
    }

    @objc func acquire(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else { call.reject("Missing ticket owner"); return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Brightness controller unavailable"); return }
            // A new preview supersedes a stale WebView owner without capturing
            // the already-boosted brightness as the user's original setting.
            self.owner = id
            self.boost()
            call.resolve(["active": self.previousBrightness != nil])
        }
    }

    @objc func release(_ call: CAPPluginCall) {
        let id = call.getString("id")
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(); return }
            if self.owner == id {
                self.owner = nil
                self.restore()
            }
            call.resolve()
        }
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        if let previous = previousBrightness, let target = screen {
            DispatchQueue.main.async { target.brightness = previous }
        }
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
