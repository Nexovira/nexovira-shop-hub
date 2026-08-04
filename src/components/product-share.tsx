import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Share2, Copy, Check, Mail, MessageCircle, Send, Facebook, Twitter } from "lucide-react";
import { toast } from "sonner";

/** Share + copy-link controls for a product page. */
export function ShareProduct({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);

  function currentUrl() {
    return typeof window === "undefined" ? "" : window.location.href;
  }

  async function copyLink() {
    const url = currentUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    const url = currentUrl();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return true;
      } catch {
        return true; // user dismissed — don't fall back
      }
    }
    return false;
  }

  const url = currentUrl();
  const enc = encodeURIComponent;
  const message = `${title} — ${text}`;

  const targets = [
    { label: "WhatsApp", icon: MessageCircle, href: `https://wa.me/?text=${enc(`${message} ${url}`)}` },
    { label: "Facebook", icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { label: "X (Twitter)", icon: Twitter, href: `https://twitter.com/intent/tweet?text=${enc(message)}&url=${enc(url)}` },
    { label: "Telegram", icon: Send, href: `https://t.me/share/url?url=${enc(url)}&text=${enc(message)}` },
    { label: "Email", icon: Mail, href: `mailto:?subject=${enc(title)}&body=${enc(`${message}\n\n${url}`)}` },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={async (e) => {
              if (await nativeShare()) e.preventDefault();
            }}
          >
            <Share2 className="h-4 w-4" /> Share
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel>Share this product</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {targets.map(({ label, icon: Icon, href }) => (
            <DropdownMenuItem key={label} asChild>
              <a href={href} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                <Icon className="mr-2 h-4 w-4" /> {label}
              </a>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={copyLink} className="cursor-pointer">
            <Copy className="mr-2 h-4 w-4" /> Copy link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" className="gap-2" onClick={copyLink}>
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
