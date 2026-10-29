import UIKit

// Original, consistently sized navigation artwork. Template UIImages let UIKit
// handle contrast and rendering; no SF Symbol's variable optical sizing.
enum SpottrTabIcons {
  static func image(index: Int, selected: Bool) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 26, height: 26))
    return renderer.image { context in
      let c = context.cgContext
      c.setStrokeColor(UIColor.white.cgColor)
      c.setFillColor(UIColor.white.cgColor)
      c.setLineWidth(2)
      c.setLineCap(.round)
      c.setLineJoin(.round)
      switch index {
      case 0:
        c.move(to: CGPoint(x: 3, y: 11))
        c.addLine(to: CGPoint(x: 13, y: 3))
        c.addLine(to: CGPoint(x: 23, y: 11))
        c.addLine(to: CGPoint(x: 23, y: 23))
        c.addLine(to: CGPoint(x: 17, y: 23))
        c.addLine(to: CGPoint(x: 17, y: 15))
        c.addLine(to: CGPoint(x: 9, y: 15))
        c.addLine(to: CGPoint(x: 9, y: 23))
        c.addLine(to: CGPoint(x: 3, y: 23))
        c.closePath()
        c.drawPath(using: selected ? .fillStroke : .stroke)
      case 1:
        c.move(to: CGPoint(x: 3, y: 6))
        c.addLine(to: CGPoint(x: 10, y: 3))
        c.addLine(to: CGPoint(x: 17, y: 6))
        c.addLine(to: CGPoint(x: 23, y: 3))
        c.addLine(to: CGPoint(x: 23, y: 20))
        c.addLine(to: CGPoint(x: 17, y: 23))
        c.addLine(to: CGPoint(x: 10, y: 20))
        c.addLine(to: CGPoint(x: 3, y: 23))
        c.closePath()
        if selected {
          c.setFillColor(UIColor.white.withAlphaComponent(0.22).cgColor)
          c.drawPath(using: .fillStroke)
        } else { c.strokePath() }
        c.move(to: CGPoint(x: 10, y: 3)); c.addLine(to: CGPoint(x: 10, y: 20))
        c.move(to: CGPoint(x: 17, y: 6)); c.addLine(to: CGPoint(x: 17, y: 23))
        c.strokePath()
      case 2:
        head(c, x: 9, y: 8, radius: 4, selected: selected)
        head(c, x: 20, y: 9, radius: 3, selected: selected)
        c.move(to: CGPoint(x: 2, y: 23))
        c.addCurve(to: CGPoint(x: 16, y: 23), control1: CGPoint(x: 2, y: 13), control2: CGPoint(x: 16, y: 13))
        if selected { c.closePath() }
        c.drawPath(using: selected ? .fillStroke : .stroke)
        c.move(to: CGPoint(x: 19, y: 16))
        c.addCurve(to: CGPoint(x: 24, y: 23), control1: CGPoint(x: 23, y: 16), control2: CGPoint(x: 24, y: 19))
        c.strokePath()
      default:
        head(c, x: 13, y: 8, radius: 5, selected: selected)
        c.move(to: CGPoint(x: 3, y: 23))
        c.addCurve(to: CGPoint(x: 23, y: 23), control1: CGPoint(x: 3, y: 12), control2: CGPoint(x: 23, y: 12))
        if selected { c.closePath() }
        c.drawPath(using: selected ? .fillStroke : .stroke)
      }
    }.withRenderingMode(.alwaysTemplate)
  }

  private static func head(_ context: CGContext, x: CGFloat, y: CGFloat, radius: CGFloat, selected: Bool) {
    context.addEllipse(in: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
    context.drawPath(using: selected ? .fillStroke : .stroke)
  }
}
