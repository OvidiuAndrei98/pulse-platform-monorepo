import ExpoModulesCore
import UIKit

public final class SpottrNativeTabsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SpottrNativeTabs")
    View(SpottrNativeTabsView.self) {
      Events("onTabSelect")
      Prop("selection") { (view, selection: TabSelection) in view.select(selection.index) }
      Prop("labels") { (view, labels: [String]) in view.setLabels(labels) }
      Prop("accentColor") { (view, color: UIColor) in view.setAccent(color) }
    }
  }
}

struct TabSelection: Record {
  @Field var index: Int = 0
  @Field var revision: Int = 0
}

// UIKit owns the material, selection animation, gesture tracking and VoiceOver.
// This view is local to its React Navigation scene: sheets and pushed screens
// cover it normally. It is never installed as a window-level overlay.
final class SpottrNativeTabsView: ExpoView, UITabBarControllerDelegate {
  let onTabSelect = EventDispatcher()
  private let controller = UITabBarController()
  private var items: [UITabBarItem] = []
  private var synchronizingSelection = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    clipsToBounds = false
    controller.overrideUserInterfaceStyle = .dark
    if #available(iOS 18.0, *) { controller.mode = .tabBar }
    let pages = (0..<4).map { index -> UIViewController in
      let page = UIViewController()
      page.view.backgroundColor = .clear
      page.view.isUserInteractionEnabled = false
      let item = UITabBarItem(title: nil,
        image: SpottrTabIcons.image(index: index, selected: false),
        selectedImage: SpottrTabIcons.image(index: index, selected: true))
      item.tag = index
      item.accessibilityIdentifier = ["tab-Home", "tab-Explore", "tab-Feed", "tab-Profile"][index]
      page.tabBarItem = item
      items.append(item)
      return page
    }
    // Configure before attaching the delegate: mounting never acts like a tap.
    controller.setViewControllers(pages, animated: false)
    controller.view.backgroundColor = .clear
    controller.view.clipsToBounds = false
    controller.tabBar.isTranslucent = true
    controller.delegate = self
    setAccent(UIColor(red: 1, green: 0, blue: 68.0 / 255.0, alpha: 1))
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detachController()
      return
    }
    attachController()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    attachController()
    controller.view.frame = bounds
  }

  private func attachController() {
    guard window != nil, controller.parent == nil else { return }
    var responder: UIResponder? = next
    while let current = responder {
      if let parent = current as? UIViewController {
        parent.addChild(controller)
        addSubview(controller.view)
        controller.view.frame = bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        controller.didMove(toParent: parent)
        return
      }
      responder = current.next
    }
  }

  private func detachController() {
    guard controller.parent != nil else { return }
    controller.willMove(toParent: nil)
    controller.view.removeFromSuperview()
    controller.removeFromParent()
  }

  // The controller has empty content above its bar. That area must not block
  // scrolling, buttons, or the system back gesture in the actual app screen.
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard !isHidden, isUserInteractionEnabled, alpha > 0.01,
      controller.parent != nil else { return nil }
    let bar = controller.tabBar
    return bar.hitTest(convert(point, to: bar), with: event)
  }

  func select(_ index: Int) {
    guard items.indices.contains(index), controller.selectedIndex != index else { return }
    // Do not rebuild the controller/items on route changes: UIKit keeps its
    // in-flight selection gesture and can interrupt its own animation.
    synchronizingSelection = true
    controller.selectedIndex = index
    synchronizingSelection = false
  }

  func setLabels(_ labels: [String]) {
    for (index, item) in items.enumerated() where labels.indices.contains(index) {
      item.accessibilityLabel = labels[index]
    }
  }

  func setAccent(_ color: UIColor) {
    // Only public appearance APIs. No private subview searches or replacement
    // gesture recognizers; the system retains ownership of the glass capsule.
    // iOS may override selectionIndicatorTintColor for its Liquid Glass platter.
    // Never compensate with a second painted/animated selection overlay.
    let appearance = UITabBarAppearance()
    appearance.selectionIndicatorTintColor = color.withAlphaComponent(0.38)
    for layout in [appearance.stackedLayoutAppearance,
                   appearance.inlineLayoutAppearance,
                   appearance.compactInlineLayoutAppearance] {
      layout.normal.iconColor = UIColor.white.withAlphaComponent(0.9)
      layout.selected.iconColor = .white
    }
    controller.tabBar.standardAppearance = appearance
    controller.tabBar.scrollEdgeAppearance = appearance
    controller.tabBar.tintColor = .white
    controller.tabBar.unselectedItemTintColor = UIColor.white.withAlphaComponent(0.9)
  }

  func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
    guard !synchronizingSelection else { return }
    onTabSelect(["index": tabBarController.selectedIndex])
  }
}
