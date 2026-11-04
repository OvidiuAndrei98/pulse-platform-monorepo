import ExpoModulesCore
import UIKit

public final class SpottrDateHapticsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SpottrDateHaptics")
    Constant("scrollFeedbackVersion") { 1 }
    View(SpottrDateHapticsView.self) {
      Prop("enabled") { (view, enabled: Bool) in view.setEnabled(enabled) }
      Prop("stepWidth") { (view, width: Double) in view.setStepWidth(width) }
    }
  }
}

// A weak display-link target avoids keeping a removed React view alive.
private final class DateFeedbackFrame: NSObject {
  weak var owner: SpottrDateHapticsView?
  @objc func update() { owner?.sampleScroll() }
}

final class SpottrDateHapticsView: ExpoView {
  private var enabled = false
  private var stepWidth: CGFloat = 44
  private weak var scroll: UIScrollView?
  private var lastIndex: Int?
  private var link: CADisplayLink?
  private let feedbackFrame = DateFeedbackFrame()
  private lazy var feedback = UISelectionFeedbackGenerator()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    isAccessibilityElement = false
    feedbackFrame.owner = self
  }

  deinit { link?.invalidate() }

  func setEnabled(_ value: Bool) {
    guard enabled != value else { return }
    enabled = value
    updateLink()
  }

  func setStepWidth(_ value: Double) {
    guard value.isFinite, value > 0 else { return }
    let next = CGFloat(value)
    if next != stepWidth { stepWidth = next; lastIndex = nil }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    scroll = nil
    updateLink()
  }

  private func updateLink() {
    guard enabled, window != nil else {
      link?.invalidate()
      link = nil
      lastIndex = nil
      return
    }
    guard link == nil else { return }
    feedback.prepare()
    let displayLink = CADisplayLink(target: feedbackFrame, selector: #selector(DateFeedbackFrame.update))
    let maximum = Float(window?.screen.maximumFramesPerSecond ?? 60)
    displayLink.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: maximum, preferred: maximum)
    displayLink.add(to: .main, forMode: .common)
    link = displayLink
  }

  private func findRibbon(in view: UIView) -> UIScrollView? {
    if let candidate = view as? UIScrollView,
      candidate.bounds.width >= stepWidth, candidate.bounds.height > 0,
      candidate.bounds.height <= 80, candidate.contentSize.width > candidate.bounds.width {
      return candidate
    }
    for child in view.subviews {
      if let candidate = findRibbon(in: child) { return candidate }
    }
    return nil
  }

  fileprivate func sampleScroll() {
    guard enabled, window != nil, UIApplication.shared.applicationState == .active else {
      lastIndex = nil
      return
    }
    if scroll == nil {
      // React/Fabric may add a host wrapper around this view. Stay within the
      // small date track; never observe the main event list or replace delegates.
      var parent = superview
      for _ in 0..<4 {
        guard let container = parent else { break }
        if let candidate = findRibbon(in: container) { scroll = candidate; break }
        parent = container.superview
      }
    }
    guard let scroll, scroll.window != nil else { return }
    let offset = scroll.contentOffset.x
    guard offset.isFinite else { return }
    let index = Int((max(0, offset) / stepWidth).rounded())
    let previous = lastIndex
    lastIndex = index
    // UIKit owns the offset and momentum. Programmatic alignment, reopening,
    // reset and date-window replacement stay silent. No JS callbacks or timers.
    guard let previous, previous != index, scroll.isDragging || scroll.isDecelerating else { return }
    feedback.selectionChanged()
    feedback.prepare()
  }
}
