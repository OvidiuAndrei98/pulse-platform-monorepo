import ExpoModulesCore
import UIKit

// Retained for existing binaries. Current iOS navigation uses the shared
// FixedCapsuleTabBar.tsx implementation in both Expo Go and installed builds.

public final class SpottrNativeTabsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SpottrNativeTabs")
    Constant("selectionBehavior") { "fixedCapsule" }
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

// Keep the native glass material, but move a fixed capsule ourselves. The system
// UITabBarController stretches/refracts its selection during a drag; the reference
// interaction only translates it. All tracking stays on the UIKit main thread.
// This view still belongs to its React Navigation scene, underneath its sheets.
final class SpottrNativeTabsView: ExpoView, UIGestureRecognizerDelegate {
  let onTabSelect = EventDispatcher()
  private let glass = UIVisualEffectView()
  private let track = UIView()
  private let indicator = UIView()
  private var buttons: [UIButton] = []
  private var selectedIndex = 0
  private var itemWidth: CGFloat = 0
  private var dragOrigin: CGFloat = 0
  private var tracking = false
  private var materialInstalled = false
  private var visibilityLink: CADisplayLink?
  private lazy var pan = UIPanGestureRecognizer(target: self, action: #selector(drag(_:)))

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    clipsToBounds = false
    overrideUserInterfaceStyle = .dark
    addSubview(glass)
    glass.clipsToBounds = true
    glass.contentView.addSubview(track)
    track.isAccessibilityElement = false
    track.accessibilityTraits = .tabBar
    track.shouldGroupAccessibilityChildren = true
    track.addSubview(indicator)
    indicator.backgroundColor = UIColor.black.withAlphaComponent(0.42)
    indicator.isUserInteractionEnabled = false
    indicator.accessibilityIdentifier = "tab-indicator"
    for index in 0..<4 {
      let button = UIButton(type: .custom)
      button.tag = index
      button.tintColor = .white
      button.setImage(SpottrTabIcons.image(index: index, selected: false), for: .normal)
      button.setImage(SpottrTabIcons.image(index: index, selected: true), for: .selected)
      button.accessibilityIdentifier = ["tab-Home", "tab-Explore", "tab-Feed", "tab-Profile"][index]
      button.addTarget(self, action: #selector(tap(_:)), for: .touchUpInside)
      track.addSubview(button)
      buttons.append(button)
    }
    pan.maximumNumberOfTouches = 1
    pan.cancelsTouchesInView = true
    pan.delegate = self
    track.addGestureRecognizer(pan)
    updateButtons(selectedIndex)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      tracking = false
      updateButtons(selectedIndex)
      moveIndicator(to: CGFloat(selectedIndex) * itemWidth, animated: false)
      visibilityLink?.invalidate()
      visibilityLink = nil
      glass.effect = nil
      materialInstalled = false
    }
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let frame = CGRect(x: 20, y: bounds.height - safeAreaInsets.bottom - 12 - 62,
      width: max(0, bounds.width - 40), height: 62)
    let resized = glass.frame != frame
    glass.frame = frame
    glass.layer.cornerRadius = frame.height / 2
    track.frame = glass.bounds.insetBy(dx: 4, dy: 4)
    itemWidth = track.bounds.width / CGFloat(buttons.count)
    if resized {
      tracking = false
      indicator.layer.removeAllAnimations()
      indicator.transform = .identity
      indicator.frame = CGRect(x: 0, y: 0, width: itemWidth, height: track.bounds.height)
      indicator.layer.cornerRadius = indicator.bounds.height / 2
      moveIndicator(to: CGFloat(selectedIndex) * itemWidth, animated: false)
      updateButtons(selectedIndex)
    }
    for (index, button) in buttons.enumerated() {
      button.frame = CGRect(x: CGFloat(index) * itemWidth, y: 0,
        width: itemWidth, height: track.bounds.height)
    }
    installMaterialWhenVisible()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    setNeedsLayout()
  }

  // Only the actual bar intercepts touches; the rest of the React host is clear.
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard !isHidden, isUserInteractionEnabled, alpha > 0.01,
      glass.frame.contains(point) else { return nil }
    return glass.hitTest(convert(point, to: glass), with: event)
  }

  func select(_ index: Int) {
    guard buttons.indices.contains(index), selectedIndex != index else { return }
    // External navigation (including a prevented selection acknowledgement)
    // cancels a preview. Updating the controlled route never emits another tap.
    tracking = false
    selectedIndex = index
    updateButtons(index)
    moveIndicator(to: CGFloat(index) * itemWidth, animated: true)
  }

  func setLabels(_ labels: [String]) {
    for (index, button) in buttons.enumerated() where labels.indices.contains(index) {
      button.accessibilityLabel = labels[index]
    }
  }

  func setAccent(_ color: UIColor) {
    tintColor = color
  }

  private func updateButtons(_ index: Int) {
    for (position, button) in buttons.enumerated() {
      button.isSelected = position == index
      button.accessibilityTraits = position == selectedIndex ? [.button, .selected] : .button
    }
  }

  private func moveIndicator(to x: CGFloat, animated: Bool) {
    let transform = CGAffineTransform(translationX: x, y: 0)
    if animated && window != nil && !UIAccessibility.isReduceMotionEnabled {
      UIView.animate(withDuration: 0.22, delay: 0,
        options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut]) {
        self.indicator.transform = transform
      }
    } else {
      indicator.layer.removeAllAnimations()
      indicator.transform = transform
    }
  }

  private func commit(_ index: Int) {
    selectedIndex = index
    updateButtons(index)
    moveIndicator(to: CGFloat(index) * itemWidth, animated: true)
    // Exactly one completed selection, even for a repeated tab. The JS bridge
    // retains role routing, tabPress prevention and scroll-to-top behavior.
    onTabSelect(["index": index])
  }

  @objc private func tap(_ button: UIButton) {
    commit(button.tag)
  }

  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    let velocity = pan.velocity(in: track)
    return itemWidth > 0 && abs(velocity.x) > abs(velocity.y)
  }

  @objc private func drag(_ gesture: UIPanGestureRecognizer) {
    guard itemWidth > 0 else { return }
    let translation = gesture.translation(in: track).x
    switch gesture.state {
    case .began:
      tracking = true
      let currentX = indicator.layer.presentation()?.affineTransform().tx ?? indicator.transform.tx
      let startX = gesture.location(in: track).x - translation
      // Keep the finger's grip point when picking up an in-flight capsule.
      dragOrigin = (currentX...(currentX + itemWidth)).contains(startX)
        ? currentX : startX - itemWidth / 2
      fallthrough
    case .changed:
      guard tracking else { return }
      let x = min(max(0, dragOrigin + translation), CGFloat(buttons.count - 1) * itemWidth)
      moveIndicator(to: x, animated: false)
      updateButtons(Int((x / itemWidth).rounded()))
    case .ended:
      guard tracking else { return }
      tracking = false
      // Clamp to the ends; no rubber band, scaling, stretching or velocity fling.
      let x = min(max(0, dragOrigin + translation), CGFloat(buttons.count - 1) * itemWidth)
      commit(Int((x / itemWidth).rounded()))
    case .cancelled, .failed:
      guard tracking else { return }
      tracking = false
      updateButtons(selectedIndex)
      moveIndicator(to: CGFloat(selectedIndex) * itemWidth, animated: true)
    default:
      break
    }
  }

  private func installMaterialWhenVisible() {
    guard !materialInstalled, window != nil, glass.bounds.width > 0 else { return }
    // Like Expo's glass surface, wait until a newly pushed/fading-in scene is
    // visible: UIKit can permanently skip glass installed under zero opacity.
    var opacity: CGFloat = 1
    var ancestor: UIView? = self
    while let view = ancestor {
      if view.isHidden { opacity = 0; break }
      opacity *= view.alpha
      ancestor = view.superview
    }
    guard opacity > 0.02 else {
      if visibilityLink == nil {
        let proxy = SpottrTabVisibilityProxy(self)
        let link = CADisplayLink(target: proxy, selector: #selector(SpottrTabVisibilityProxy.tick))
        link.add(to: .main, forMode: .common)
        visibilityLink = link
      }
      return
    }
    visibilityLink?.invalidate()
    visibilityLink = nil
    var effect: UIVisualEffect = UIBlurEffect(style: .systemChromeMaterialDark)
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      let material = UIGlassEffect(style: .regular)
      material.isInteractive = false
      effect = material
      let radius = UICornerRadius(floatLiteral: glass.bounds.height / 2)
      glass.cornerConfiguration = .corners(topLeftRadius: radius, topRightRadius: radius,
        bottomLeftRadius: radius, bottomRightRadius: radius)
    }
    #endif
    glass.effect = effect
    materialInstalled = true
  }

  deinit {
    visibilityLink?.invalidate()
  }
}

private final class SpottrTabVisibilityProxy: NSObject {
  private weak var view: SpottrNativeTabsView?

  init(_ view: SpottrNativeTabsView) {
    self.view = view
  }

  @objc func tick() {
    view?.setNeedsLayout()
  }
}
