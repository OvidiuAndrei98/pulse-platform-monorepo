import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Register cold-start links before the bridge appears and loads plugins.
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Keep our gesture and ticket-brightness plugins in the scene's bridge.
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = AppViewController()
        self.window = window
        window.makeKeyAndVisible()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
