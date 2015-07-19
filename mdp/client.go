package mdp

import (
	"bytes"
	"fmt"
	czmq "github.com/zeromq/goczmq"
	"log"
	"time"
)

type Client struct {
	sock   *czmq.Sock
	broker string
	poller *czmq.Poller

	RetryInterval time.Duration
	RetryCount    int64
}

func NewClient(broker string) (c *Client) {
	c = &Client{
		broker:        broker,
		RetryCount:    3,
		RetryInterval: 1000 * time.Millisecond,
	}
	return
}

// TODO(sissel): With timeout?
func (c *Client) Send(service string, body [][]byte) (response [][]byte, err error) {
	err = c.ensure_connected()
	if err != nil {
		return
	}

	var reply [][]byte
	got_reply := false
	for i := int64(0); !got_reply && i < c.RetryCount; i += 1 {
		// Since we're using a REQ socket, we use a 3-frame message instead of the 4-frame message a DEALER would use.
		// TODO(sissel): The body can occupy more than 1 frame, let's maybe support that some day?
		var request [3][]byte = [3][]byte{
			MDP_CLIENT,
			[]byte{byte(C_REQUEST)},
			[]byte(service),
		}

		frames := append(request[:], body...)

		for j, x := range frames {
			log.Printf("Client (try %d): frame %d: %v (%s)\n", i, j, x, string(x))
		}
		err = c.sock.SendMessage(frames)
		if err != nil {
			log.Printf("Client: Error sending message: %s\n", err)
			return
		}

		log.Printf("Client: Waiting...")
		s := c.poller.Wait(c.retryIntervalInMilliseconds())
		log.Printf("Client: Socket is ready... %s", s)
		if s != nil {
			log.Printf("Client: Reading ...")
			reply, err = s.RecvMessage()
			for i, x := range reply {
				log.Printf("Client(via Broker): frame %d: %v (%s)\n", i, x, string(x))
			}
			log.Printf("Client: Done Reading ...")
			if err != nil {
				log.Printf("Client: Error receiving message: %s\n", err)
				return
			}
			got_reply = true
		} else {
			// Timeout
			log.Printf("Client: Timeout on try %d of request to %s service\n", i, service)
			c.Destroy()
			c.ensure_connected()
		}
	}

	if !got_reply {
		log.Printf("Client: Request timeout (after %d attempts at %s interval)\n", c.RetryCount, c.RetryInterval)
		return
	}
	log.Printf("GOT REPLY")

	if count := len(reply); count < 3 {
		err = fmt.Errorf("Majordomo protocol problem. A REPLY must be at least 3 frames, got %d frames in a message.", count)
		return
	}

	if !bytes.Equal(reply[0], MDP_CLIENT) {
		err = fmt.Errorf("Majordomo protocol problem. Expected first frame to be `%s`. Got something else.", string(MDP_CLIENT))
		return
	}

	// Should we bother checking the `service` frame (reply[1]) ?
	response = reply[3:]
	return
}

func (c *Client) Destroy() {
	c.sock.Destroy()
	c.poller.Destroy()
	c.sock = nil
	c.poller = nil
}

func (c *Client) ensure_connected() error {
	if c.sock != nil {
		return nil
	}

	var err error
	c.sock, err = czmq.NewReq(c.broker)
	if err != nil {
		return err
	}
	c.poller, err = czmq.NewPoller(c.sock)
	if err != nil {
		return err
	}
	return nil
}

func (c *Client) retryIntervalInMilliseconds() int {
	return int(int64(c.RetryInterval / time.Millisecond))
}
