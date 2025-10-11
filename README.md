# USD-RUB - Exchange Rate Indicator

A GNOME Shell extension that displays the current USD to RUB exchange rate on the panel.

## Features

- Real-time USD/RUB exchange rate updates from multiple APIs
- Multiple positioning options (right/left of clock, panel sides)
- **NEW**: Custom position index control
- Automatic error handling with retry mechanism
- Fallback API providers for reliability

## Installation

[Download via Gnome Extension Store](https://extensions.gnome.org/extension/7908/usd-to-rub-exchange-rate/)

### or

```bash
git clone https://github.com/Makev1ch/USD-RUB.git ~/.local/share/gnome-shell/extensions/usd-rub@makev1ch.github.com
```

Restart GNOME Shell (Alt+F2 → restart in X11, or logout/login in Wayland).

## Configuration

In GNOME Extensions app configure:
- **Indicator position**: Choose placement (right/left of clock)
- **Position index**: Fine-tune position (0 = default, -1 = end)

## Technical Details

- Updates every 5 minutes (30 seconds on errors)
- Uses multiple API providers:
  - exchangerate.host
  - er-api.com
  - fawazahmed0 currency-api
- Follows GNOME Shell extension guidelines
- Automatic fallback between providers on failures
