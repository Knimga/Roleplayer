import { Component } from "react";

// React has no hook equivalent for error boundaries - a class is the only way
// to catch a render-time throw. Without one, any such throw unmounts the
// entire app and the user gets a blank screen, taking every piece of
// in-memory state with it. That matters most around the Campaign Management
// modal, where an unapproved Blueprint draft represents a paid-for model run
// that a crash would otherwise discard.
//
// Reset by remounting: give it a `key` that changes when the thing being
// rendered changes (e.g. the active tab), since a boundary that has caught
// stays in its error state until it unmounts.
//
// Scope is an open decision, not a settled one: used in exactly one place
// today, it should either move to the app root or be deleted. See
// specs/campaign-situation.md §9.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Render error caught by boundary:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return typeof this.props.fallback === "function" ? this.props.fallback(error) : this.props.fallback;
    }
    return <p role="alert">Something went wrong displaying this section: {error.message}</p>;
  }
}
